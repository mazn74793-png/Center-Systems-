/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  setDoc, 
  addDoc,
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  onSnapshot,
  Timestamp,
  runTransaction,
  getDocFromServer
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase applet
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId); /* CRITICAL: The app will break without this line */
export const auth = getAuth();
export const googleProvider = new GoogleAuthProvider();

// Standard validation check on boot
async function validateFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('offline')) {
      console.warn("Firebase client reports as offline. Verify credentials.");
    }
  }
}
validateFirestoreConnection();

// Dynamic operation types for strict payload-level logging
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

/**
 * Handle Firestore Insufficient Permissions / Rule check crashes
 */
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Secure Guard Triggered: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * GENERATES EXTREMELY BEAUTIFUL SEQUENTIAL ID (e.g. std001, std002) WITH TRANSACTION LOCKING
 */
export async function generateSequentialStudentId(): Promise<string> {
  const counterDocRef = doc(db, 'centers_config', 'student_counter');
  
  try {
    const nextId = await runTransaction(db, async (transaction) => {
      const counterDoc = await transaction.get(counterDocRef);
      
      let currentVal = 0;
      if (counterDoc.exists()) {
        currentVal = counterDoc.data().count || 0;
      }
      
      const newVal = currentVal + 1;
      transaction.set(counterDocRef, { count: newVal }, { merge: true });
      return newVal;
    });

    const paddedNum = String(nextId).padStart(3, '0'); // std001, std014, std135
    return `std${paddedNum}`;
  } catch (error) {
    console.warn("Counter transaction unavailable, fallback to list-count strategy", error);
    // Fallback safe counting for development/local environment
    const querySnapshot = await getDocs(collection(db, 'students'));
    const totalCount = querySnapshot.size + 1;
    const padded = String(totalCount).padStart(3, '0');
    return `std${padded}`;
  }
}

/**
 * WHATSAPP AUTOMATION BLUEPRINTS & PAYLOAD LOGS
 * Simulates real trigger dispatch to UltraMsg/GreenAPI gateway and saves webhook payload.
 */
export interface WhatsAppPayloadLog {
  timestamp: string;
  recipientPhone: string;
  recipientName: string;
  messageType: 'registration' | 'attendance' | 'absence_warning' | 'payment_alert';
  payloadBody: any;
  endpointUrl: string;
  status: 'sent' | 'simulated_sent' | 'failed';
  waLink?: string;
}

// Global hooks for in-app simulated message monitoring
let whatsappListeners: Array<(log: WhatsAppPayloadLog) => void> = [];
export function onWhatsAppTriggered(callback: (log: WhatsAppPayloadLog) => void) {
  whatsappListeners.push(callback);
  return () => {
    whatsappListeners = whatsappListeners.filter(l => l !== callback);
  };
}

export function formatPhoneForWhatsApp(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }
  // Egyptian prefix standard check
  if (digits.startsWith('20') && digits.length > 10) {
    return digits;
  }
  if (digits.startsWith('0') && digits.length === 11) {
    return '2' + digits; // 010... -> 2010...
  }
  if (digits.length === 10 && (digits.startsWith('1') || digits.startsWith('5'))) {
    return '20' + digits; // 10... -> 2010...
  }
  if (digits.length === 11 && !digits.startsWith('2')) {
    return '2' + digits; // 010... without leading is 10 digits, other handles
  }
  return digits || phone;
}

export async function triggerWhatsAppNotice(
  type: 'registration' | 'attendance' | 'absence_warning' | 'payment_alert',
  recipientName: string,
  parentPhone: string,
  extraData: {
    studentId?: string;
    studentName?: string;
    groupName?: string;
    amount?: number;
    qrUrl?: string;
    timestamp?: string;
  }
): Promise<WhatsAppPayloadLog> {
  // Fetch current configs as source
  let gatewayUrl = 'https://api.ultramsg.com/v1/messages/chat';
  let token = 'MOCK_TOKEN_ADMIN_CONFIGURED';
  let instanceId = 'instance1001';
  let enabled = true;
  let welcomeTemplate = "Welcome {student_name}! Your student ID is {student_id}. Use your QR code for future attendance scans.";
  let attendanceTemplate = "Dear parent, your son/daughter {student_name} has safely arrived at the center for class: {group_name} at {timestamp}. All settled.";
  let whatsappMode: 'free_wa_link' | 'api_gateway' = 'free_wa_link';

  try {
    const configSnap = await getDoc(doc(db, 'centers_config', 'main_config'));
    if (configSnap.exists()) {
      const data = configSnap.data();
      gatewayUrl = data.whatsappApiUrl || gatewayUrl;
      token = data.whatsappToken || token;
      instanceId = data.whatsappInstanceId || instanceId;
      enabled = data.whatsappEnabled ?? enabled;
      welcomeTemplate = data.welcomeTemplate || welcomeTemplate;
      attendanceTemplate = data.attendanceTemplate || attendanceTemplate;
      whatsappMode = data.whatsappMode || whatsappMode;
    }
  } catch (err) {
    console.log("Using default mockup templates due to initial setup state.");
  }

  // Construct automated payload matching UltraMsg message blueprint
  let messageContent = '';
  if (type === 'registration') {
    messageContent = welcomeTemplate
      .replace('{student_name}', recipientName)
      .replace('{student_id}', extraData.studentId || '')
      .replace('{qr_link}', extraData.qrUrl || `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${extraData.studentId}`);
  } else if (type === 'attendance') {
    messageContent = attendanceTemplate
      .replace('{student_name}', recipientName)
      .replace('{group_name}', extraData.groupName || 'My Group')
      .replace('{timestamp}', extraData.timestamp || new Date().toLocaleTimeString());
  } else if (type === 'payment_alert') {
    messageContent = `⚠️ Alert: Unpaid session fee detected for student: ${recipientName} in class ${extraData.groupName}. Pending amount: ${extraData.amount} EGP.`;
  } else {
    messageContent = `Dear parent, student ${recipientName} was marked ABSENT today from class ${extraData.groupName}. Please verify.`;
  }

  // Build beautiful standard payload expected by WhatsApp gateways:
  const formattedPhone = parentPhone.startsWith('+') ? parentPhone : `+2${parentPhone}`; // Arabic / Egyptian local code standard format
  const payloadBody = {
    token: token,
    to: formattedPhone, // Arabic / Egyptian local code standard format
    body: messageContent,
    priority: 10,
    referenceId: extraData.studentId || 'system'
  };

  const waNumber = formatPhoneForWhatsApp(parentPhone);
  const waLink = `https://wa.me/${waNumber}?text=${encodeURIComponent(messageContent)}`;

  let finalEndpoint = whatsappMode === 'free_wa_link' ? 'https://wa.me' : `${gatewayUrl}?instance=${instanceId}`;
  let status: 'sent' | 'simulated_sent' | 'failed' = 'simulated_sent';

  if (enabled && whatsappMode === 'api_gateway') {
    const isMockToken = !token || token === 'MOCK_TOKEN_ADMIN_CONFIGURED' || token.trim() === '';
    
    // Resolve right endpoint path for UltraMsg if it has "v1" or standard domains
    let targetUrl = gatewayUrl;
    if (targetUrl.includes('api.ultramsg.com') && instanceId) {
      if (targetUrl.includes('v1/messages/chat')) {
        targetUrl = targetUrl.replace('v1', instanceId);
      } else if (!targetUrl.includes(instanceId)) {
        targetUrl = `https://api.ultramsg.com/${instanceId}/messages/chat`;
      }
    }
    finalEndpoint = targetUrl;

    if (!isMockToken) {
      try {
        const urlParams = new URLSearchParams();
        urlParams.append('token', token);
        urlParams.append('to', formattedPhone);
        urlParams.append('body', messageContent);
        urlParams.append('priority', '10');
        if (extraData.studentId) {
          urlParams.append('referenceId', extraData.studentId);
        }

        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: urlParams
        });

        if (response.ok) {
          status = 'sent';
        } else {
          console.warn("UltraMsg gateway returned error code:", response.status);
          status = 'failed';
        }
      } catch (fetchErr) {
        console.error("Failed to fetch WhatsApp gateway:", fetchErr);
        status = 'failed';
      }
    }
  }

  const dispatchLog: WhatsAppPayloadLog = {
    timestamp: new Date().toLocaleTimeString(),
    recipientPhone: parentPhone,
    recipientName: recipientName,
    messageType: type,
    payloadBody: payloadBody,
    endpointUrl: finalEndpoint,
    status: status,
    waLink: waLink
  };

  // Dispatch to listeners so the scanner UI can show instantaneous visual notification pings
  whatsappListeners.forEach(listener => listener(dispatchLog));
  return dispatchLog;
}
