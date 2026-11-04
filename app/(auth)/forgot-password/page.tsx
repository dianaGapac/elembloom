"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Mail, Sprout } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
	const [email, setEmail] = useState("");
	const [sent, setSent] = useState(false);
	const [error, setError] = useState("");
	async function submit(e: React.FormEvent) {
		e.preventDefault();
		setError("");
		const { error } = await createClient().auth.resetPasswordForEmail(
			email.trim(),
			{ redirectTo: `${window.location.origin}/auth/callback` },
		);
		if (error) setError("We couldn't send the reset email. Please try again.");
		else setSent(true);
	}
	return (
		<main className='flex min-h-screen items-center justify-center bg-[#e8fff3] px-4'>
			<section className='w-full max-w-md rounded-2xl bg-white p-8 shadow-xl'>
				<div className='mb-6 flex items-center justify-center gap-2'>
					<img
						src='/logo.png'
						alt='ElemBloom'
						className='mx-auto h-24 w-40 object-contain'
					/>
				</div>
				{sent ? (
					<div className='text-center'>
						<h1 className='text-xl font-bold'>Check your email</h1>
						<p className='mt-2 text-sm text-[#52635a]'>
							If an account exists for {email}, we&apos;ll send a password reset
							link.
						</p>
					</div>
				) : (
					<>
						<h1 className='text-xl font-bold'>Forgot your password?</h1>
						<p className='mt-2 text-sm text-[#52635a]'>
							Enter your email and we&apos;ll send you a secure reset link.
						</p>
						<form onSubmit={submit} className='mt-6 flex flex-col gap-4'>
							<label className='flex flex-col gap-2 text-xs font-semibold'>
								Email Address
								<div className='flex items-center gap-3 rounded-lg border border-[#e1ebe5] px-3 py-2.5'>
									<Mail className='size-4 text-[#77867e]' />
									<input
										required
										type='email'
										value={email}
										onChange={(e) => setEmail(e.target.value)}
										className='min-w-0 flex-1 bg-transparent text-sm outline-none'
									/>
								</div>
							</label>
							{error && <p className='text-xs text-red-700'>{error}</p>}
							<button className='rounded-lg bg-[#087a49] py-3 text-sm font-bold text-white'>
								Send Reset Link
							</button>
						</form>
					</>
				)}
				<Link
					href='/login'
					className='mt-6 flex items-center justify-center gap-2 text-sm font-semibold text-[#087a49]'
				>
					<ArrowLeft className='size-4' /> Back to sign in
				</Link>
			</section>
		</main>
	);
}
