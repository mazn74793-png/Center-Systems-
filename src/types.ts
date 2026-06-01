/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum UserRole {
  ADMIN = 'admin',
  TEACHER = 'teacher',
  ASSISTANT = 'assistant'
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  teacherId?: string;
  createdAt?: string;
}

export interface Student {
  id?: string; // Firestore doc ID
  studentId: string; // Sequential ID like std001
  name: string;
  phone: string;
  parentPhone: string;
  academicYear: string;
  qrCodeData: string;
  createdAt: any; // Firestore Timestamp or ISO string
}

export interface Teacher {
  id: string; // Firestore doc ID or custom
  name: string;
  phone: string;
  subject: string;
  defaultShare: number; // e.g. 70 for 70% share
}

export interface ClassGroup {
  id?: string; // Firestore doc ID
  teacherId: string;
  name: string;
  pricePerSession: number;
  bookletPrice: number;
  bookletCost: number;
  bookletStock: number;
  teacherShare: number; // custom share override
  schedule: string;
}

export interface AttendanceLog {
  id?: string;
  studentId: string;
  studentName: string;
  groupId: string;
  sessionId: string;
  timestamp: any; // Firestore timestamp or date
  status: 'present' | 'absent';
  isPaid: boolean;
  paymentAmount: number;
  bookletReceived: boolean;
  bookletPaid: boolean;
}

export interface FinancialSession {
  id?: string;
  groupId: string;
  sessionDate: any;
  totalAttendance: number;
  totalSessionRevenue: number;
  totalBookletsSold: number;
  totalBookletRevenue: number;
  teacherEarnings: number;
  centerEarnings: number;
  cashCollected: number;
  isClosed: boolean;
  closedAt?: any;
}

export interface CenterExpense {
  id?: string;
  category: 'Rent' | 'Utilities' | 'Salaries' | 'Marketing' | 'Printing' | 'Other';
  amount: number;
  description: string;
  date: any;
  addedBy: string; // Name or UID of admin/assistant
}

export interface CenterConfig {
  id?: string;
  name: string;
  currency: string;
  whatsappEnabled: boolean;
  whatsappApiUrl: string;
  whatsappToken: string;
  whatsappInstanceId: string;
  welcomeTemplate: string;
  attendanceTemplate: string;
  whatsappMode?: 'free_wa_link' | 'api_gateway';
}

// Translations type contract
export interface TranslationKeys {
  appName: string;
  loginTitle: string;
  loginSub: string;
  tagline: string;
  roleSelect: string;
  adminTitle: string;
  teacherTitle: string;
  assistantTitle: string;
  studentManagement: string;
  addStudent: string;
  studentList: string;
  studentId: string;
  studentName: string;
  mobile: string;
  parentMobile: string;
  parentPhone: string;
  academicYear: string;
  qrCode: string;
  scanAttendance: string;
  cameraAccess: string;
  attendanceLogs: string;
  status: string;
  present: string;
  absent: string;
  actions: string;
  isPaid: string;
  paid: string;
  unpaid: string;
  paymentAmount: string;
  bookletReceived: string;
  bookletPaid: string;
  groupedBy: string;
  revenueSplits: string;
  teacherEarnings: string;
  centerEarnings: string;
  classesAndGroups: string;
  pricePerSession: string;
  bookletPrice: string;
  bookletCost: string;
  bookletStock: number | string;
  teacherShare: string;
  schedule: string;
  viewDetails: string;
  expensesLedger: string;
  addExpense: string;
  expenseAmount: string;
  expenseCategory: string;
  expenseDescription: string;
  netProfits: string;
  totalRevenue: string;
  totalExpenses: string;
  netProfit: string;
  financialMetrics: string;
  whatsappSettings: string;
  whatsappEnabled: string;
  apiUrl: string;
  apiToken: string;
  instanceId: string;
  saveSettings: string;
  searchStudent: string;
  selectGroup: string;
  selectTeacher: string;
  teachersRegistry: string;
  registerTeacher: string;
  subject: string;
  defaultSharePct: string;
  selectRole: string;
  createGroup: string;
  activeSession: string;
  closeSession: string;
  sessionStatus: string;
  open: string;
  closed: string;
  drawerCash: string;
  totalAttendanceShort: string;
  bookletsSold: string;
  whatsappLog: string;
  whatsAppLogDesc: string;
  welcomeMessageSent: string;
  attendanceMessageSent: string;
  loading: string;
  error: string;
  success: string;
  or: string;
  logout: string;
  noData: string;
  searchAndScanLabel: string;
  startScanning: string;
  stopScanning: string;
  toggleLang: string;
  simulatedNotification: string;
  instantNotificationAlert: string;
  arabic: string;
  english: string;
}
