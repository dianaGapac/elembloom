import { generateText } from "ai"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const source = typeof body.source === "string" ? body.source.trim() : ""
    if (!source) return NextResponse.json({ error: "Progress input is required." }, { status: 400 })
    const { text } = await generateText({
      model: "openai/gpt-4o-mini",
      system: "You summarize teacher session notes for a parent-facing school update. Be warm, factual, concise, and strengths-based. Do not invent information, diagnose, label the learner, or include sensitive details that were not provided. Return 2-4 sentences and mention the next step when available.",
      prompt: `Summarize these teacher notes for a parent update:\n\n${source}`,
    })
    return NextResponse.json({ summary: text.trim() })
  } catch (error) {
    console.error("[v0] intervention summary failed", error)
    return NextResponse.json({ error: "The progress summary could not be generated." }, { status: 500 })
  }
}
