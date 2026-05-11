// ============================================================
// mediaService.js — Camera / Microphone Permission + Stream Management
// ============================================================

/**
 * Request local media stream with appropriate constraints.
 *
 * @param {'video'|'voice'} callType
 * @returns {Promise<MediaStream>}
 */
export const getLocalStream = async (callType = "video") => {
  const constraints = {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl:  true,
    },
    video: callType === "video"
      ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }
      : false,
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    return stream;
  } catch (error) {
    if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
      throw new Error("PERMISSION_DENIED");
    }
    if (error.name === "NotFoundError") {
      throw new Error("DEVICE_NOT_FOUND");
    }
    throw error;
  }
};

/**
 * Check current permission state without prompting.
 * @returns {Promise<{camera: PermissionState, microphone: PermissionState}>}
 */
export const checkPermissions = async () => {
  const results = { camera: "prompt", microphone: "prompt" };

  if (!navigator.permissions) return results;

  try {
    const [cam, mic] = await Promise.all([
      navigator.permissions.query({ name: "camera" }),
      navigator.permissions.query({ name: "microphone" }),
    ]);
    results.camera      = cam.state;
    results.microphone  = mic.state;
  } catch {
    // Firefox doesn't support camera/microphone permission queries
  }

  return results;
};

/**
 * Gracefully stop all tracks in a stream.
 * @param {MediaStream|null} stream
 */
export const stopStream = (stream) => {
  if (!stream) return;
  stream.getTracks().forEach(track => track.stop());
};

/**
 * Enumerate available input devices.
 * @returns {Promise<{audioInputs: MediaDeviceInfo[], videoInputs: MediaDeviceInfo[]}>}
 */
export const getDevices = async () => {
  const devices     = await navigator.mediaDevices.enumerateDevices();
  const audioInputs = devices.filter(d => d.kind === "audioinput");
  const videoInputs = devices.filter(d => d.kind === "videoinput");
  return { audioInputs, videoInputs };
};

/**
 * Switch camera device on an existing stream's video track.
 * @param {RTCPeerConnection} pc
 * @param {string} deviceId
 */
export const switchCamera = async (pc, deviceId) => {
  const newStream = await navigator.mediaDevices.getUserMedia({
    video: { deviceId: { exact: deviceId } },
    audio: false,
  });
  const [newVideoTrack] = newStream.getVideoTracks();

  const sender = pc.getSenders().find(s => s.track?.kind === "video");
  if (sender) {
    await sender.replaceTrack(newVideoTrack);
  }

  return newVideoTrack;
};
