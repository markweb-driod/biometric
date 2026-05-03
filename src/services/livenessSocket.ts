/**
 * WebSocket service for real-time biometric liveness checks.
 * Streams camera frames to the backend and listens for validation events.
 */

export interface LivenessSocketEvents {
  onStatus: (status: {
    liveness_passed: boolean;
    count: number;
    has_motion: boolean;
    face_in_frame?: boolean;
  }) => void;
  onError: (error: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

export class LivenessSocket {
  private socket: WebSocket | null = null;
  private url: string;
  private events: LivenessSocketEvents;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;

  constructor(url: string, events: LivenessSocketEvents) {
    this.url = url;
    this.events = events;
  }

  connect() {
    if (
      this.socket?.readyState === WebSocket.OPEN ||
      this.socket?.readyState === WebSocket.CONNECTING
    ) return;

    try {
      this.intentionalClose = false;
      this.socket = new WebSocket(this.url);

      this.socket.onopen = () => {
        console.log('Liveness WebSocket connected');
        this.events.onConnect();
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'liveness_status') {
            this.events.onStatus(data.payload);
          } else if (data.type === 'error') {
            this.events.onError(data.message);
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message', e);
        }
      };

      this.socket.onclose = () => {
        if (this.intentionalClose) {
          this.socket = null;
          return;
        }
        console.log('Liveness WebSocket disconnected');
        this.events.onDisconnect();
        this.socket = null;
        // Simple linear backoff for reconnection
        this.reconnectTimer = setTimeout(() => this.connect(), 3000);
      };

      this.socket.onerror = (err) => {
        if (
          this.intentionalClose ||
          this.socket?.readyState === WebSocket.CLOSING ||
          this.socket?.readyState === WebSocket.CLOSED
        ) {
          return;
        }
        console.error('Liveness WebSocket error', err);
        this.events.onError('Connection error');
      };
    } catch (e) {
      console.error('Failed to initialize WebSocket', e);
      this.events.onError('Initialization error');
    }
  }

  /**
   * Send a frame for analysis.
   * @param frame Base64 data URL or binary blob
   */
  sendFrame(frame: string) {
    if (this.socket?.readyState !== WebSocket.OPEN) return;

    // Send as JSON for now, or binary if the backend supports it.
    // User mentioned "live active quick checks", so we'll push the raw base64.
    this.socket.send(JSON.stringify({
      type: 'analyze_frame',
      payload: { frame }
    }));
  }

  disconnect() {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.onclose = null; // Prevent reconnect on intentional disconnect
      this.socket.close();
      this.socket = null;
    }
  }
}

/**
 * Mock version of the socket for development and demo purposes.
 * Automatically "passes" after receiving a few frames.
 */
export class MockLivenessSocket {
  private events: LivenessSocketEvents;
  private frameCount = 0;
  private isConnected = false;

  constructor(_url: string, events: LivenessSocketEvents) {
    this.events = events;
  }

  connect() {
    setTimeout(() => {
      this.isConnected = true;
      this.events.onConnect();
      console.log('Mock Liveness WebSocket connected');
    }, 500);
  }

  sendFrame(_frame: string) {
    if (!this.isConnected) return;
    this.frameCount++;

    // Simulate real-time processing delay
    setTimeout(() => {
      this.events.onStatus({
        liveness_passed: this.frameCount >= 5,
        count: Math.min(this.frameCount, 5),
        has_motion: this.frameCount >= 2,
        face_in_frame: true,
      });
    }, 100);
  }

  disconnect() {
    this.isConnected = false;
    this.events.onDisconnect();
    console.log('Mock Liveness WebSocket disconnected');
  }
}
