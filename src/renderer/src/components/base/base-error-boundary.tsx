import { tr } from '../../../../shared/i18n'
import { Button } from '@heroui/react'
import { JSX, ReactNode } from 'react'
import { ErrorBoundary, FallbackProps } from 'react-error-boundary'

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

const getErrorStack = (error: unknown): string => {
  if (error instanceof Error && typeof error.stack === 'string') {
    return error.stack
  }
  return ''
}

const ErrorFallback = ({ error }: FallbackProps): JSX.Element => {
  const message = getErrorMessage(error)
  const stack = getErrorStack(error)

  return (
    <div className="p-4">
      <h2 className="my-2 text-lg font-bold">
        {tr('The app encountered an error. Copy the details below for troubleshooting.')}
      </h2>

      <Button
        size="sm"
        variant="primary"
        onPress={() => navigator.clipboard.writeText('```\n' + message + '\n' + stack + '\n```')}
      >
        {tr('Copy error details')}
      </Button>

      <p className="my-2">{message}</p>

      <details title="Error Stack">
        <summary>Error Stack</summary>
        <pre>{stack}</pre>
      </details>
    </div>
  )
}

interface Props {
  children?: ReactNode
}

const BaseErrorBoundary = (props: Props): JSX.Element => {
  return <ErrorBoundary FallbackComponent={ErrorFallback}>{props.children}</ErrorBoundary>
}

export default BaseErrorBoundary
