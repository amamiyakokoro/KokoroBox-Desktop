import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { resolveLicenseDocumentLink, type AboutInfo } from '../../../../shared/about'

interface Props {
  text: string
  name: string
  title: string
  documents: AboutInfo['documents']
  onOpenDocument: (document: AboutInfo['documents'][number]) => void
}

export const LicenseDocument: React.FC<Props> = ({
  text,
  name,
  title,
  documents,
  onOpenDocument
}) => {
  if (!/\.md$/i.test(name)) {
    const content =
      text.split('\n\n' + '='.repeat(80) + '\n\n').find((part) => part.startsWith(title + '\n')) ||
      text
    return <pre className="whitespace-pre-wrap break-words text-xs select-text">{content}</pre>
  }
  return (
    <div className="about-license-markdown min-w-0 select-text">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ href, children }) => {
            const document = resolveLicenseDocumentLink(name, href || '', documents)
            if (document) {
              return (
                <button
                  type="button"
                  title={document.name}
                  onClick={() => onOpenDocument(document)}
                >
                  {children}
                </button>
              )
            }
            if (href?.startsWith('#')) return <a href={href}>{children}</a>
            if (href && /^https?:\/\//i.test(href)) {
              return (
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              )
            }
            return <span>{children}</span>
          },
          img: ({ alt }) => <span>{alt}</span>,
          table: ({ children }) => (
            <div className="about-license-markdown__table">
              <table>{children}</table>
            </div>
          )
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
