"use client";

import Link from "next/link";
import { useState } from "react";
import {
	BadgeCheck,
	Eye,
	EyeOff,
	LockKeyhole,
	Mail,
	UserRound,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function RegisterPage() {
	const [fullName, setFullName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	const [complete, setComplete] = useState(false);

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError("");
		if (password !== confirm) {
			setError("Passwords do not match.");
			return;
		}
		setLoading(true);
		const { error: signUpError } = await createClient().auth.signUp({
			email: email.trim(),
			password,
			options: {
				emailRedirectTo:
					process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ??
					`${window.location.origin}/auth/callback?next=/dashboard`,
				data: { full_name: fullName.trim() },
			},
		});
		if (signUpError)
			setError(
				signUpError.message.toLowerCase().includes("already")
					? "Unable to create this account. Please check your details or sign in."
					: signUpError.message,
			);
		else setComplete(true);
		setLoading(false);
	}

	return (
		<main className='flex min-h-screen items-center justify-center bg-background px-4 py-8 text-foreground'>
			<section className='w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm sm:p-8'>
				<header className='mb-6 text-center'>
					<img
						src='/logo.png'
						alt='ElemBloom'
						className='mx-auto h-24 w-40 object-contain'
					/>
					<h1 className='mt-4 text-xl font-bold'>
						Create your ElemBloom account
					</h1>
					<p className='mt-2 text-sm text-muted-foreground'>
						Manage classes, learning activities, and pupil progress in one
						workspace.
					</p>
				</header>
				{complete ? (
					<div className='rounded-xl bg-secondary p-5 text-center text-sm'>
						<BadgeCheck className='mx-auto mb-2 size-8 text-primary' />
						<p className='font-semibold'>Check your email to continue</p>
						<p className='mt-1 text-muted-foreground'>
							We sent a confirmation link to {email}.
						</p>
						<Link
							href='/login'
							className='mt-4 inline-block font-semibold text-primary hover:underline'
						>
							Back to sign in
						</Link>
					</div>
				) : (
					<form onSubmit={handleSubmit} className='flex flex-col gap-4'>
						<label className='flex flex-col gap-2 text-sm font-medium'>
							Full name
							<span className='flex h-11 items-center gap-3 rounded-lg border px-3 focus-within:ring-2 focus-within:ring-ring'>
								<UserRound className='size-4 text-muted-foreground' />
								<input
									required
									autoComplete='name'
									value={fullName}
									onChange={(event) => setFullName(event.target.value)}
									className='min-w-0 flex-1 bg-transparent text-sm outline-none'
								/>
							</span>
						</label>
						<label className='flex flex-col gap-2 text-sm font-medium'>
							Email address
							<span className='flex h-11 items-center gap-3 rounded-lg border px-3 focus-within:ring-2 focus-within:ring-ring'>
								<Mail className='size-4 text-muted-foreground' />
								<input
									required
									type='email'
									autoComplete='email'
									value={email}
									onChange={(event) => setEmail(event.target.value)}
									className='min-w-0 flex-1 bg-transparent text-sm outline-none'
								/>
							</span>
						</label>
						<label className='flex flex-col gap-2 text-sm font-medium'>
							Password
							<span className='flex h-11 items-center gap-3 rounded-lg border px-3 focus-within:ring-2 focus-within:ring-ring'>
								<LockKeyhole className='size-4 text-muted-foreground' />
								<input
									required
									minLength={8}
									type={showPassword ? "text" : "password"}
									autoComplete='new-password'
									value={password}
									onChange={(event) => setPassword(event.target.value)}
									className='min-w-0 flex-1 bg-transparent text-sm outline-none'
								/>
								<button
									type='button'
									aria-label={showPassword ? "Hide password" : "Show password"}
									onClick={() => setShowPassword(!showPassword)}
									className='text-muted-foreground'
								>
									{showPassword ? (
										<EyeOff className='size-4' />
									) : (
										<Eye className='size-4' />
									)}
								</button>
							</span>
						</label>
						<label className='flex flex-col gap-2 text-sm font-medium'>
							Confirm password
							<span className='flex h-11 items-center gap-3 rounded-lg border px-3 focus-within:ring-2 focus-within:ring-ring'>
								<LockKeyhole className='size-4 text-muted-foreground' />
								<input
									required
									minLength={8}
									type='password'
									autoComplete='new-password'
									value={confirm}
									onChange={(event) => setConfirm(event.target.value)}
									className='min-w-0 flex-1 bg-transparent text-sm outline-none'
								/>
							</span>
						</label>
						{error && (
							<p
								role='alert'
								className='rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive'
							>
								{error}
							</p>
						)}
						<button
							disabled={loading}
							className='h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60'
						>
							{loading ? "Creating account…" : "Create account"}
						</button>
					</form>
				)}
				{!complete && (
					<p className='mt-6 text-center text-sm text-muted-foreground'>
						Already have an account?{" "}
						<Link
							href='/login'
							className='font-semibold text-primary hover:underline'
						>
							Sign in
						</Link>
					</p>
				)}
			</section>
		</main>
	);
}
