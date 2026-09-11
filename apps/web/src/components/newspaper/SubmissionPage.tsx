import CaptureForm from '../CaptureForm'
import PagedContent from './PagedContent'
export default function SubmissionPage() {
  return <PagedContent label="Share a Challenge"><div className="np-form"><h1>Share a Challenge</h1><CaptureForm paged /></div></PagedContent>
}
