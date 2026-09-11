import AccountWorkspace from '../AccountWorkspace'
import PagedContent from './PagedContent'
export default function AccountPage() {
  return <PagedContent label="Your account"><div className="np-form np-account"><AccountWorkspace /></div></PagedContent>
}
