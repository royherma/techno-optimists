import CaptureForm from '../CaptureForm'
import PagedContent from './PagedContent'
export default function SubmissionPage() {
  return <PagedContent label="Share a thread"><div className="np-form"><h1>Share a thread</h1><CaptureForm paged /></div></PagedContent>
}
