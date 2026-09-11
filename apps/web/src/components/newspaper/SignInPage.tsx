import SignInForm from '../SignInForm'
import PagedContent from './PagedContent'
export default function SignInPage() {
  return <PagedContent label="Sign in"><div className="np-form np-signin"><p className="np-story-meta">Welcome to the conversation</p><h1>A brighter tomorrow<br />starts with people.</h1><p className="np-deck">Sign in to share a thread, bring an idea, or follow what happens next.</p><SignInForm /><blockquote>Curiosity is a good place to start.</blockquote></div></PagedContent>
}
