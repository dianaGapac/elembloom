import { createClient } from "@/lib/supabase/client"

const seedDefinitions = [
  { first_name: "Amara", last_name: "Santos", gender: "female" },
  { first_name: "Bianca", last_name: "Reyes", gender: "female" },
  { first_name: "Camila", last_name: "Cruz", gender: "female" },
  { first_name: "Dahlia", last_name: "Garcia", gender: "female" },
  { first_name: "Elena", last_name: "Mendoza", gender: "female" },
  { first_name: "Farah", last_name: "Bautista", gender: "female" },
  { first_name: "Gabriela", last_name: "Villanueva", gender: "female" },
  { first_name: "Hana", last_name: "Aquino", gender: "female" },
  { first_name: "Isabella", last_name: "Castillo", gender: "female" },
  { first_name: "Jasmine", last_name: "Ramos", gender: "female" },
  { first_name: "Kiara", last_name: "Flores", gender: "female" },
  { first_name: "Lucia", last_name: "Navarro", gender: "female" },
  { first_name: "Maya", last_name: "Rivera", gender: "female" },
  { first_name: "Nina", last_name: "Torres", gender: "female" },
  { first_name: "Olivia", last_name: "Fernandez", gender: "female" },
  { first_name: "Andres", last_name: "Dela Cruz", gender: "male" },
  { first_name: "Bruno", last_name: "Gonzales", gender: "male" },
  { first_name: "Caleb", last_name: "Lopez", gender: "male" },
  { first_name: "Diego", last_name: "Perez", gender: "male" },
  { first_name: "Enzo", last_name: "Santiago", gender: "male" },
  { first_name: "Felix", last_name: "Domingo", gender: "male" },
  { first_name: "Gabriel", last_name: "Morales", gender: "male" },
  { first_name: "Hugo", last_name: "Aquino", gender: "male" },
  { first_name: "Ivan", last_name: "Mercado", gender: "male" },
  { first_name: "Joaquin", last_name: "Pascual", gender: "male" },
  { first_name: "Luis", last_name: "Salazar", gender: "male" },
  { first_name: "Mateo", last_name: "Valdez", gender: "male" },
  { first_name: "Nico", last_name: "Aguilar", gender: "male" },
  { first_name: "Oscar", last_name: "Manalo", gender: "male" },
  { first_name: "Paolo", last_name: "Tan", gender: "male" },
] as const

const guardianEmail = "buenaventurajennifer93@gmail.com"
const studentNumberFor = (index: number) => `SEED30-${String(index + 1).padStart(3, "0")}`

type SeedClass = { id: string; grade_level: number; section_name: string; school_year: string }

export async function seedPupilsAcrossClasses() {
  const supabase = createClient()
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError) throw authError
  if (!auth.user) throw new Error("Your session has expired. Please sign in again.")

  const { data: classRows, error: classError } = await supabase
    .from("classes")
    .select("id,grade_level,section_name,school_year")
    .eq("teacher_id", auth.user.id)
    .eq("is_active", true)
    .order("grade_level")
    .order("section_name")
  if (classError) throw new Error(`Could not load active classes: ${classError.message}`)
  const classes = (classRows ?? []) as SeedClass[]
  if (classes.length !== 3) {
    throw new Error(`This seed setup expects exactly 3 active classes; found ${classes.length}. No pupils were added.`)
  }

  const definitions = seedDefinitions.map((student, index) => ({
    ...student,
    student_number: studentNumberFor(index),
    class_id: classes[Math.floor(index / 10)].id,
  }))
  const { data: existing, error: lookupError } = await supabase
    .from("students")
    .select("id,student_number,first_name,last_name,gender,class_id,parent_guardian_email")
    .eq("teacher_id", auth.user.id)
    .in("student_number", definitions.map((student) => student.student_number))
  if (lookupError) throw new Error(`Could not check for existing sample pupils: ${lookupError.message}`)

  const existingByNumber = new Map((existing ?? []).map((student) => [student.student_number, student]))
  for (const definition of definitions) {
    const student = existingByNumber.get(definition.student_number)
    if (!student) continue
    if (
      student.first_name !== definition.first_name ||
      student.last_name !== definition.last_name ||
      student.gender !== definition.gender ||
      student.parent_guardian_email !== guardianEmail
    ) {
      throw new Error(`Student number ${definition.student_number} already belongs to a different pupil record. No pupils were added.`)
    }
    if (student.class_id && student.class_id !== definition.class_id) {
      throw new Error(`Sample pupil ${definition.student_number} is already assigned to a different class. No pupils were added.`)
    }
  }

  const definitionsToInsert = definitions.filter((definition) => !existingByNumber.has(definition.student_number))
  if (definitionsToInsert.length) {
    const { data: inserted, error: insertError } = await supabase
      .from("students")
      .insert(definitionsToInsert.map((student) => ({
        teacher_id: auth.user.id,
        class_id: student.class_id,
        student_number: student.student_number,
        first_name: student.first_name,
        last_name: student.last_name,
        gender: student.gender,
        parent_guardian_email: guardianEmail,
        parent_guardian_name: null,
        email_notifications_enabled: false,
        is_active: true,
      })))
      .select("id,student_number,first_name,last_name,gender,class_id,parent_guardian_email")
    if (insertError) {
      throw new Error(`Could not add sample pupils: ${insertError.message}`)
    }
    if (inserted?.length !== definitionsToInsert.length) {
      throw new Error(`Expected ${definitionsToInsert.length} inserted pupils but received ${inserted?.length ?? 0}.`)
    }
    for (const student of inserted) existingByNumber.set(student.student_number, student)
  }

  const pupilsNeedingClass = definitions.filter((definition) => existingByNumber.get(definition.student_number)?.class_id === null)
  for (const definition of pupilsNeedingClass) {
    const pupil = existingByNumber.get(definition.student_number)
    if (!pupil) throw new Error(`Could not find sample pupil ${definition.student_number} after insertion.`)
    const { error } = await supabase.from("students")
      .update({ class_id: definition.class_id })
      .eq("id", pupil.id)
      .eq("teacher_id", auth.user.id)
    if (error) throw new Error(`Could not assign sample pupil ${definition.student_number} to its class: ${error.message}`)
    existingByNumber.set(definition.student_number, { ...pupil, class_id: definition.class_id })
  }

  const pupilIds = definitions.map((definition) => existingByNumber.get(definition.student_number)?.id).filter((id): id is string => Boolean(id))
  if (pupilIds.length !== definitions.length) throw new Error("Could not verify all seeded pupil records.")
  const { data: enrollmentRows, error: enrollmentLookupError } = await supabase
    .from("class_enrollments")
    .select("student_id,class_id,status")
    .eq("teacher_id", auth.user.id)
    .in("student_id", pupilIds)
  if (enrollmentLookupError) throw new Error(`Could not check sample pupil class enrollments: ${enrollmentLookupError.message}`)

  const enrollments = enrollmentRows ?? []
  for (const definition of definitions) {
    const pupil = existingByNumber.get(definition.student_number)
    if (!pupil) throw new Error(`Could not find sample pupil ${definition.student_number} for enrollment.`)
    const pupilEnrollments = enrollments.filter((item) => item.student_id === pupil.id)
    if (pupilEnrollments.some((item) => item.status === "active" && item.class_id !== definition.class_id)) {
      throw new Error(`Sample pupil ${definition.student_number} already has an active enrollment in another class.`)
    }
    const matchingEnrollment = pupilEnrollments.find((item) => item.class_id === definition.class_id)
    if (matchingEnrollment?.status === "withdrawn") {
      const { error } = await supabase.from("class_enrollments")
        .update({ status: "active" })
        .eq("teacher_id", auth.user.id)
        .eq("student_id", pupil.id)
        .eq("class_id", definition.class_id)
        .eq("status", "withdrawn")
      if (error) throw new Error(`Could not reactivate class enrollment for ${definition.student_number}: ${error.message}`)
    } else if (!matchingEnrollment) {
      const { error } = await supabase.from("class_enrollments").insert({
        teacher_id: auth.user.id,
        class_id: definition.class_id,
        student_id: pupil.id,
        status: "active",
      })
      if (error) throw new Error(`Could not enroll sample pupil ${definition.student_number}: ${error.message}`)
    }
  }

  return {
    pupilCount: definitions.length,
    femaleCount: definitions.filter((student) => student.gender === "female").length,
    maleCount: definitions.filter((student) => student.gender === "male").length,
    addedCount: definitionsToInsert.length,
    classes: classes.map((item, index) => ({ ...item, pupilCount: definitions.filter((_, pupilIndex) => Math.floor(pupilIndex / 10) === index).length })),
  }
}
