import PagedContent from './PagedContent'
/** html is trusted, checked-in legal/article content shared with Classic. */
export default function ReaderPage({ html, title }: { html: string; title: string }) {
  return <PagedContent label={title}><div className="np-article" dangerouslySetInnerHTML={{ __html: html }} /></PagedContent>
}
