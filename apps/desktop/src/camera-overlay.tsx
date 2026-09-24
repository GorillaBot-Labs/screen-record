import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Maximize2, Minimize2 } from 'lucide-react'

import type { CameraOverlaySize } from '../electron/preload'
import {
  CAMERA_OVERLAY_SIZE_KEY,
  parseStoredCameraOverlaySize,
} from './camera-overlay-size'

import './overlay-base.css'
import './camera-overlay.css'

async function pickVideoDeviceId(cameraIndex: number): Promise<string | undefined> {
  const devices = await navigator.mediaDevices.enumerateDevices()
  const cameras = devices.filter((d) => d.kind === 'videoinput')
  return cameras[cameraIndex]?.deviceId
}

function loadStoredSize(): CameraOverlaySize {
  try {
    return parseStoredCameraOverlaySize(localStorage.getItem(CAMERA_OVERLAY_SIZE_KEY))
  } catch {
    return 'small'
  }
}

function persistSize(size: CameraOverlaySize) {
  try {
    localStorage.setItem(CAMERA_OVERLAY_SIZE_KEY, size)
  } catch {
    /* ignore */
  }
}

function CameraOverlayApp() {
  const api = window.electronAPI?.cameraOverlay
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const dragRef = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [size, setSize] = useState<CameraOverlaySize>(() => loadStoredSize())
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (!api?.pullInitial) return

    let cancelled = false

    void (async () => {
      const initial = await api.pullInitial()
      if (cancelled || initial == null || initial.cameraIndex < 0) return

      const preferred = loadStoredSize()
      setSize(preferred)
      if (preferred !== initial.size) {
        await api.setSize?.(preferred)
      }

      try {
        const deviceId = await pickVideoDeviceId(initial.cameraIndex)
        const constraints: MediaStreamConstraints = {
          video: deviceId
            ? { deviceId: { exact: deviceId }, width: { ideal: 640 }, height: { ideal: 640 } }
            : { width: { ideal: 640 }, height: { ideal: 640 } },
          audio: false,
        }
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop()
          return
        }
        streamRef.current = stream
        const el = videoRef.current
        if (el) {
          el.srcObject = stream
          await el.play().catch(() => undefined)
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setError(msg)
      }
    })()

    return () => {
      cancelled = true
      const stream = streamRef.current
      if (stream) {
        for (const track of stream.getTracks()) track.stop()
        streamRef.current = null
      }
    }
  }, [api])

  const toggleSize = useCallback(async () => {
    if (!api?.setSize) return
    const next: CameraOverlaySize = size === 'small' ? 'large' : 'small'
    const res = await api.setSize(next)
    if (!res.ok) return
    setSize(next)
    persistSize(next)
  }, [api, size])

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    if ((event.target as HTMLElement).closest('.camera-overlay-size-btn')) return
    dragRef.current = {
      pointerId: event.pointerId,
      lastX: event.screenX,
      lastY: event.screenY,
    }
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [])

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId || !api?.moveBy) return
      const deltaX = event.screenX - drag.lastX
      const deltaY = event.screenY - drag.lastY
      if (deltaX === 0 && deltaY === 0) return
      drag.lastX = event.screenX
      drag.lastY = event.screenY
      void api.moveBy(deltaX, deltaY)
    },
    [api],
  )

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  return (
    <div className="camera-overlay-root" aria-label="Camera preview">
      <div className="camera-overlay-shell">
        <div
          className={dragging ? 'camera-overlay-frame camera-overlay-frame--dragging' : 'camera-overlay-frame'}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          role="presentation"
        >
          {error ? (
            <div className="camera-overlay-placeholder">Camera unavailable</div>
          ) : (
            <video ref={videoRef} className="camera-overlay-video" autoPlay muted playsInline />
          )}
        </div>

        <button
          type="button"
          className="camera-overlay-size-btn"
          onClick={() => void toggleSize()}
          aria-label={size === 'small' ? 'Make camera larger' : 'Make camera smaller'}
          title={size === 'small' ? 'Larger' : 'Smaller'}
        >
          {size === 'small' ? <Maximize2 size={14} strokeWidth={2.25} aria-hidden /> : <Minimize2 size={14} strokeWidth={2.25} aria-hidden />}
        </button>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<CameraOverlayApp />)
