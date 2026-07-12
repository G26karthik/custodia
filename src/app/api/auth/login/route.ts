import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { signSession, setSessionCookie } from '@/lib/auth';
import bcrypt from 'bcryptjs';

import { z } from 'zod';

const LoginSchema = z.object({
  email: z.string().trim().email('A valid email address is required.'),
  password: z.string().min(1, 'Password is required.'),
});

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input.' }, { status: 400 });
    }

    const { email, password } = parsed.data;

    // Find user
    const user = await db.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid email or password.' },
        { status: 401 }
      );
    }

    if (user.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'Your account is deactivated. Please contact an admin.' },
        { status: 403 }
      );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Invalid email or password.' },
        { status: 401 }
      );
    }

    // Create session
    const token = await signSession({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    await setSessionCookie(token);

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        departmentId: user.departmentId,
      },
    });
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
