import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Only our uploaded media can render inline. External resources remain links;
// raw HTML is never interpreted, and Markdown's safe URL transform stays on.
export const isDiscussionMedia = (url: string) => /^\/media\/u\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.(jpg|png|webp|heic|heif|mp4|mov|webm)$/.test(url)
export default function ResponseContent({ body }: { body: string }) {
  return <div className="response-body response-rich"><Markdown remarkPlugins={[remarkGfm]} skipHtml
    disallowedElements={['table', 'input']} unwrapDisallowed components={{
      a: ({ href, children }) => <a href={href} target="_blank" rel="nofollow ugc noopener noreferrer">{children}</a>,
      img: ({ src, alt }) => {
        if (typeof src !== 'string' || !isDiscussionMedia(src)) return <span>{alt || 'Image'} (attach the file to show it here)</span>
        if (/\.(mp4|mov|webm)$/.test(src)) return <video src={src} controls playsInline preload="metadata" aria-label={alt || 'Attached video'}><a href={src}>Open video</a></video>
        return <a href={src} target="_blank" rel="noopener noreferrer"><img src={src} alt={alt || 'Attached image'} loading="lazy" /></a>
      },
    }}>{body}</Markdown></div>
}
