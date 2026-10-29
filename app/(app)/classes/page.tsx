import { redirect } from "next/navigation"

export default function ClassesPage() {
  redirect("/profile?classes=1#classes")
}
