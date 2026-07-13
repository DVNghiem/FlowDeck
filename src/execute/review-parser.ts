export type ReviewStatus = "APPROVED" | "APPROVED_WITH_NOTES" | "REJECTED"

export interface ReviewVerdict {
  status: ReviewStatus
  comments: string
}

/** Parse a review-verdict block from reviewer output */
export function parseReviewVerdict(output: string): ReviewVerdict | null {
  const blockMatch = output.match(/```review-verdict\s*([\s\S]*?)\s*```/)
  if (!blockMatch) return null

  const block = blockMatch[1]
  const statusMatch = block.match(/status:\s*(APPROVED|APPROVED_WITH_NOTES|REJECTED)/i)
  if (!statusMatch) return null

  const comments = parseComments(block)

  return {
    status: statusMatch[1].toUpperCase() as ReviewStatus,
    comments,
  }
}

function parseComments(block: string): string {
  const commentsMatch = block.match(/comments:\s*([\s\S]*)/i)
  if (!commentsMatch) return ""

  return commentsMatch[1]
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith("comments:"))
    .join("\n")
}
