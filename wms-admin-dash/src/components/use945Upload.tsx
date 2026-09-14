import { useCallback, useRef, useState } from 'react'
import { upload945, type Actor } from '../lib/api'
import ProcessOverlay, { type ProcessOverlayPhase } from './ui/ProcessOverlay'

type Use945UploadArgs = {
  orderId: string
  actor?: Actor
  fulfillmentGroupId?: string
  onDone: () => void
  onError?: (message: string) => void
}

export function use945Upload({
  orderId,
  actor = 'platform',
  fulfillmentGroupId,
  onDone,
  onError,
}: Use945UploadArgs) {
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<ProcessOverlayPhase>('working')
  const [filename, setFilename] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const successPendingRef = useRef(false)
  const onDoneRef = useRef(onDone)
  const onErrorRef = useRef(onError)
  onDoneRef.current = onDone
  onErrorRef.current = onError

  const close = useCallback(() => {
    const shouldRefresh = successPendingRef.current
    successPendingRef.current = false
    setOpen(false)
    setPhase('working')
    setFilename('')
    setErrorMessage('')
    if (shouldRefresh) onDoneRef.current()
  }, [])

  const startUpload = useCallback(
    (file: File, opts?: { fulfillmentGroupId?: string }) => {
      const groupId = opts?.fulfillmentGroupId ?? fulfillmentGroupId
      setFilename(file.name)
      setErrorMessage('')
      setPhase('working')
      successPendingRef.current = false
      setOpen(true)

      void upload945(orderId, file, actor, {
        fulfillmentGroupId: groupId || undefined,
      })
        .then(() => {
          successPendingRef.current = true
          setPhase('success')
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : '945 upload failed'
          successPendingRef.current = false
          setPhase('error')
          setErrorMessage(message)
          onErrorRef.current?.(message)
        })
    },
    [actor, fulfillmentGroupId, orderId],
  )

  const overlay = (
    <ProcessOverlay
      open={open}
      phase={phase}
      title={
        phase === 'working' ? 'Uploading 945' : phase === 'success' ? '945 processed' : 'Upload failed'
      }
      detail={
        phase === 'working'
          ? 'Parsing the warehouse ASN and updating shipment status…'
          : phase === 'success'
            ? 'Shipment recorded. Refreshing order details.'
            : 'The file could not be processed. Fix the file or try again.'
      }
      filename={filename}
      errorMessage={errorMessage}
      onClose={close}
    />
  )

  return { startUpload, overlay, uploading: open && phase === 'working' }
}
