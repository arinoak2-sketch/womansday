import { useRouter } from '../router/router'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/Misc'

/**
 * Reached by an unknown URL, or by a bookmark to a goal that has since been
 * deleted — which is the common case, so the copy names it.
 */
export function NotFound({ path }: { path: string }) {
  const { navigate } = useRouter()

  return (
    <div className="not-found">
      <EmptyState
        icon="search"
        title="That page isn't here"
        message={
          <>
            Nothing lives at <code>{path}</code>. If this was a goal, it may have been deleted —
            deleted goals don't leave a page behind.
          </>
        }
        action={
          <Button variant="primary" icon="home" onClick={() => navigate({ name: 'dashboard' })}>
            Back to your goals
          </Button>
        }
      />
    </div>
  )
}
