import type { EnrollmentApiErrorCode } from '../services/enrollmentApi';

export type EnrollmentStep = 'face-capture' | 'fingerprint' | 'review' | 'complete';

export type CaptureState =
  | { status: 'idle' }
  | { status: 'requesting-permission' }
  | { status: 'permission-denied'; error: string }
  | { status: 'streaming' }
  | { status: 'captured'; imageData: string }
  | { status: 'submitting'; imageData: string }
  | { status: 'success' }
  | {
    status: 'error';
    error: string;
    imageData: string;
    backendCode?: EnrollmentApiErrorCode;
    retryable: boolean;
    shouldRecapture: boolean;
  };

export interface EnrollmentState {
  step: EnrollmentStep;
  userId: string;
  faceCapture: CaptureState;
  fingerprintDone: boolean;
  /** Preserved face image data for the review step. */
  capturedFaceImageData?: string;
}

export const initialEnrollmentState = (userId: string): EnrollmentState => ({
  step: 'face-capture',
  userId,
  faceCapture: { status: 'idle' },
  fingerprintDone: false,
});

export type EnrollmentAction =
  | { type: 'CAMERA_PERMISSION_REQUESTED' }
  | { type: 'CAMERA_PERMISSION_DENIED'; error: string }
  | { type: 'CAMERA_STREAMING' }
  | { type: 'FACE_CAPTURED'; imageData: string }
  | { type: 'FACE_RECAPTURE' }
  | { type: 'FACE_SUBMITTING' }
  | { type: 'FACE_SUBMIT_SUCCESS' }
  | {
    type: 'FACE_SUBMIT_ERROR';
    error: string;
    backendCode?: EnrollmentApiErrorCode;
    retryable?: boolean;
    shouldRecapture?: boolean;
  }
  | { type: 'FACE_RETRY_SUBMIT' }
  | { type: 'FACE_ADVANCE' }
  | { type: 'FINGERPRINT_DONE' }
  | { type: 'RESET' };

export function enrollmentReducer(
  state: EnrollmentState,
  action: EnrollmentAction
): EnrollmentState {
  switch (action.type) {
    case 'CAMERA_PERMISSION_REQUESTED':
      return { ...state, faceCapture: { status: 'requesting-permission' } };

    case 'CAMERA_PERMISSION_DENIED':
      return {
        ...state,
        faceCapture: { status: 'permission-denied', error: action.error },
      };

    case 'CAMERA_STREAMING':
      return { ...state, faceCapture: { status: 'streaming' } };

    case 'FACE_CAPTURED':
      return {
        ...state,
        faceCapture: { status: 'captured', imageData: action.imageData },
      };

    case 'FACE_RECAPTURE':
      return { ...state, faceCapture: { status: 'streaming' } };

    case 'FACE_SUBMITTING':
      if (state.faceCapture.status === 'captured') {
        return {
          ...state,
          faceCapture: {
            status: 'submitting',
            imageData: state.faceCapture.imageData,
          },
        };
      }
      if (state.faceCapture.status === 'error') {
        return {
          ...state,
          faceCapture: {
            status: 'submitting',
            imageData: state.faceCapture.imageData,
          },
        };
      }
      return state;

    case 'FACE_SUBMIT_SUCCESS':
      return {
        ...state,
        faceCapture: { status: 'success' },
      };

    case 'FACE_ADVANCE':
      return {
        ...state,
        step: 'fingerprint',
      };

    case 'FACE_SUBMIT_ERROR':
      if (
        state.faceCapture.status !== 'submitting'
      )
        return state;
      return {
        ...state,
        faceCapture: {
          status: 'error',
          error: action.error,
          imageData: state.faceCapture.imageData,
          backendCode: action.backendCode,
          retryable: action.retryable ?? true,
          shouldRecapture: action.shouldRecapture ?? false,
        },
      };

    case 'FACE_RETRY_SUBMIT':
      if (state.faceCapture.status !== 'error') return state;
      return {
        ...state,
        faceCapture: {
          status: 'captured',
          imageData: state.faceCapture.imageData,
        },
      };

    case 'FINGERPRINT_DONE':
      return { ...state, fingerprintDone: true, step: 'complete' };

    case 'RESET':
      return initialEnrollmentState(state.userId);

    default:
      return state;
  }
}
