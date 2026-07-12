import { z } from 'zod';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { logActivity } from '@/lib/notifications';

// Zod schema for asset registration (Global Standards Rule 3)
export const RegisterAssetSchema = z.object({
  name: z.string().min(1, { message: 'Asset name is required.' }),
  categoryId: z.string().cuid({ message: 'A valid category must be selected.' }),
  serialNumber: z.string().optional().nullable(),
  acquisitionDate: z.string().optional().nullable(),
  acquisitionCost: z.union([z.string(), z.number()]).optional().nullable(),
  condition: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  departmentId: z.string().optional().nullable(),
  photoUrl: z.string().url({ message: 'Photo URL must be a valid URL.' }).optional().nullable(),
  isBookable: z.boolean().optional().default(false),
});

export type RegisterAssetInput = z.infer<typeof RegisterAssetSchema>;

export async function registerAsset(
  registeredById: string,
  input: RegisterAssetInput
) {
  // Validate with Zod (throws ZodError on failure)
  const validated = RegisterAssetSchema.parse(input);

  // Check serial number uniqueness if provided
  if (validated.serialNumber) {
    const existingSerial = await db.asset.findUnique({
      where: { serialNumber: validated.serialNumber },
    });
    if (existingSerial) {
      throw new Error(`Serial Number ${validated.serialNumber} is already registered.`);
    }
  }

  // Concurrency-safe unique asset tag generation with retries
  let retries = 5;
  let createdAsset = null;

  while (retries > 0) {
    const candidates = await db.asset.findMany({
      where: { assetTag: { startsWith: 'AF-' } },
      orderBy: { assetTag: 'desc' },
      take: 50,
      select: { assetTag: true },
    });

    let nextNum = 1;
    for (const candidate of candidates) {
      const match = candidate.assetTag.match(/^AF-(\d+)$/);
      if (match) {
        nextNum = parseInt(match[1], 10) + 1;
        break;
      }
    }

    const assetTag = `AF-${String(nextNum).padStart(4, '0')}`;

    try {
      createdAsset = await db.asset.create({
        data: {
          assetTag,
          name: validated.name,
          categoryId: validated.categoryId,
          serialNumber: validated.serialNumber || null,
          acquisitionDate: validated.acquisitionDate ? new Date(validated.acquisitionDate) : null,
          acquisitionCost: validated.acquisitionCost
            ? new Prisma.Decimal(String(validated.acquisitionCost))
            : null,
          condition: validated.condition || null,
          location: validated.location || null,
          departmentId: validated.departmentId || null,
          photoUrl: validated.photoUrl || null,
          isBookable: validated.isBookable ?? false,
          status: 'AVAILABLE',
        },
        include: {
          category: { select: { name: true } },
          department: { select: { name: true } },
        },
      });
      break;
    } catch (err: any) {
      if (err.code === 'P2002' && err.meta?.target?.includes('assetTag')) {
        retries--;
        if (retries === 0) {
          throw new Error('Failed to generate a unique asset tag after multiple retries.');
        }
      } else {
        throw err;
      }
    }
  }

  if (!createdAsset) throw new Error('Asset creation failed unexpectedly.');

  // Log activity (Global Standards Rule 4 — notify/log wired from service)
  await logActivity(
    registeredById,
    'REGISTER_ASSET',
    'Asset',
    createdAsset.id,
    { assetTag: createdAsset.assetTag, name: createdAsset.name }
  );

  return createdAsset;
}
