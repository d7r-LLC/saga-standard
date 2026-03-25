// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

interface ProfileBioProps {
  bio: string | null
}

export function ProfileBio({ bio }: ProfileBioProps) {
  if (!bio) return null

  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">
        About
      </h2>
      <div className="prose prose-sm max-w-none prose-slate dark:prose-invert">
        {bio.split('\n').map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>
    </div>
  )
}
