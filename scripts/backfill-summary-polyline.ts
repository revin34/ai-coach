import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { buildRoutePolyline } from '../server/utils/route-polyline'

// Fills Workout.summaryPolyline from stored GPS streams for activities that have
// a route but no preview (e.g. Intervals.icu imports). Only touches rows where
// summaryPolyline is empty. Dry run by default; pass --apply to write.
const apply = process.argv.includes('--apply')

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

async function main() {
  const rows = await prisma.$queryRaw<
    { workoutId: string; lat: number[] | null; lng: number[] | null }[]
  >`
    SELECT s."workoutId", s.lat, s.lng
    FROM "WorkoutStreamV2" s
    JOIN "Workout" w ON w.id = s."workoutId"
    WHERE (w."summaryPolyline" IS NULL OR w."summaryPolyline" = '')
      AND s.lat IS NOT NULL AND s.lng IS NOT NULL
      AND array_length(s.lat, 1) > 1
  `

  let updated = 0
  let skipped = 0
  for (const row of rows) {
    const lat = row.lat ?? []
    const lng = row.lng ?? []
    const n = Math.min(lat.length, lng.length)
    const points: [number, number][] = []
    for (let i = 0; i < n; i++) points.push([lat[i]!, lng[i]!])

    const polyline = buildRoutePolyline(points)
    if (!polyline) {
      skipped++
      continue
    }
    if (apply) {
      await prisma.workout.update({
        where: { id: row.workoutId },
        data: { summaryPolyline: polyline }
      })
    }
    updated++
  }

  console.log(
    `${apply ? 'Updated' : 'Would update'} ${updated} workouts, skipped ${skipped} (no usable route), candidates ${rows.length}.`
  )
  if (!apply) console.log('Dry run. Re-run with --apply to write.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
