/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { 
  collection, 
  getDocs, 
  addDoc, 
  doc, 
  setDoc, 
  getDoc,
  query,
  where,
  serverTimestamp,
  updateDoc 
} from 'firebase/firestore';
import { 
  db, 
  generateSequentialStudentId, 
  triggerWhatsAppNotice, 
  onWhatsAppTriggered, 
  WhatsAppPayloadLog,
  handleFirestoreError,
  OperationType
} from '../lib/firebase';
import { Student, ClassGroup, AttendanceLog, FinancialSession, TranslationKeys } from '../types';
import { 
  QrCode, 
  Camera, 
  CameraOff, 
  UserPlus, 
  Search, 
  DollarSign, 
  AlertCircle, 
  CheckCircle, 
  Mail, 
  Radio, 
  Volume2, 
  BookOpen, 
  ArrowRightLeft,
  Printer,
  Download,
  X,
  Sliders,
  IdCard,
  Info
} from 'lucide-react';
import { motion } from 'motion/react';
import { Html5QrcodeScanner } from 'html5-qrcode';

interface AssistantDashboardProps {
  t: TranslationKeys;
  isRtl: boolean;
  onRefreshStats: () => void;
}

export default function AssistantDashboard({ t, isRtl, onRefreshStats }: AssistantDashboardProps) {
  // DB States
  const [students, setStudents] = useState<Student[]>([]);
  const [groups, setGroups] = useState<ClassGroup[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [activeSession, setActiveSession] = useState<FinancialSession | null>(null);
  const [activeGroup, setActiveGroup] = useState<ClassGroup | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  
  // Scanned / Selected Student details state
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [scanStatus, setScanStatus] = useState({ text: '', type: '' });

  // Outgoing Attendance Parameters
  const [isPaid, setIsPaid] = useState(true);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [bookletReceived, setBookletReceived] = useState(false);
  const [bookletPaid, setBookletPaid] = useState(false);

  // New Student Input Form
  const [newStudent, setNewStudent] = useState({
    name: '',
    phone: '',
    parentPhone: '',
    academicYear: 'Grade 10 / الصف الأول الثانوي'
  });
  const [isRegistering, setIsRegistering] = useState(false);

  // WhatsApp Gateway Stream logs
  const [whatsappLogs, setWhatsappLogs] = useState<WhatsAppPayloadLog[]>([]);
  const [latestWATrigger, setLatestWATrigger] = useState<{ name: string; type: string; phone: string; link: string } | null>(null);
  const [autoOpenWA, setAutoOpenWA] = useState(() => localStorage.getItem('auto_open_wa') === 'true');

  const toggleAutoOpenWA = (checked: boolean) => {
    setAutoOpenWA(checked);
    localStorage.setItem('auto_open_wa', checked ? 'true' : 'false');
  };

  const [fastSettleMode, setFastSettleMode] = useState(() => localStorage.getItem('fast_settle_mode') !== 'false');

  const toggleFastSettleMode = (checked: boolean) => {
    setFastSettleMode(checked);
    localStorage.setItem('fast_settle_mode', checked ? 'true' : 'false');
  };

  // QR Code printing states
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [selectedPrintStudents, setSelectedPrintStudents] = useState<string[]>([]);
  const [printColumns, setPrintColumns] = useState(2);
  const [qrUrls, setQrUrls] = useState<Record<string, string>>({});
  const [printSearchQuery, setPrintSearchQuery] = useState('');
  
  // Printed Badges Options
  const [printCardSize, setPrintCardSize] = useState<'standard' | 'small' | 'badge'>('badge');
  const [printShowBorder, setPrintShowBorder] = useState(true);
  const [printShowPhone, setPrintShowPhone] = useState(true);
  const [printShowAcademicYear, setPrintShowAcademicYear] = useState(true);
  const [printCenterName, setPrintCenterName] = useState(() => localStorage.getItem('printed_center_name') || 'مركز التميز التعليمي');

  // Pre-generate QR Base64 URLs off-thread
  useEffect(() => {
    let activeGenerations = true;
    const generateAllQRs = async () => {
      const generated: Record<string, string> = {};
      for (const student of students) {
        if (!activeGenerations) return;
        try {
          const u = await QRCode.toDataURL(student.studentId, {
            margin: 1,
            width: 200,
            color: {
              dark: '#0f172a', // Slate 900
              light: '#ffffff'
            }
          });
          generated[student.studentId] = u;
        } catch (err) {
          console.error("QRCode generation error for " + student.studentId, err);
        }
      }
      if (activeGenerations) {
        setQrUrls(generated);
      }
    };
    if (students.length > 0) {
      generateAllQRs();
    }
    return () => {
      activeGenerations = false;
    };
  }, [students]);

  const handleOpenPrintModal = () => {
    if (!activeGroup) return;
    
    // Select matched academic year students by default to avoid coordinator fatigue
    const normalize = (txt: string) => {
      return txt
        .replace(/أ/g, 'ا')
        .replace(/إ/g, 'ا')
        .replace(/آ/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .toLowerCase();
    };
    
    const grpName = normalize(activeGroup.name || '');
    const isFirstSec = grpName.includes('اول') || grpName.includes('10') || grpName.includes('one') || grpName.includes('الاول');
    const isSecondSec = grpName.includes('ثاني') || grpName.includes('تاني') || grpName.includes('11') || grpName.includes('two') || grpName.includes('الثاني');
    const isThirdSec = grpName.includes('ثالث') || grpName.includes('تالت') || grpName.includes('12') || grpName.includes('three') || grpName.includes('الثالث');

    const matchedIds = students.filter(student => {
      const studentYear = normalize(student.academicYear || '');
      if (isFirstSec && (studentYear.includes('اول') || studentYear.includes('10') || studentYear.includes('الاول'))) return true;
      if (isSecondSec && (studentYear.includes('ثاني') || studentYear.includes('تاني') || studentYear.includes('11') || studentYear.includes('الثاني'))) return true;
      if (isThirdSec && (studentYear.includes('ثالث') || studentYear.includes('تالت') || studentYear.includes('12') || studentYear.includes('الثالث'))) return true;
      
      const words = studentYear.split(/\s+/);
      return words.some(w => w.length > 2 && grpName.includes(w));
    }).map(s => s.studentId);

    setSelectedPrintStudents(matchedIds.length > 0 ? matchedIds : students.map(s => s.studentId));
    setPrintSearchQuery('');
    setPrintCenterName(localStorage.getItem('printed_center_name') || 'مركز التميز التعليمي');
    setShowPrintModal(true);
  };

  // Camera settings
  const [cameraActive, setCameraActive] = useState(false);
  const scannerRef = useRef<any>(null);

  // Sound Synth Beep
  const playBeep = (freq = 950, duration = 0.1) => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      console.log("Beep simulation audio waiting for gesture click", e);
    }
  };

  // Initial loads
  useEffect(() => {
    loadInitData();
    
    // Subscribe to simulated real-time WhatsApp payload stream tracker
    const unsubscribe = onWhatsAppTriggered((log) => {
      setWhatsappLogs(prev => [log, ...prev].slice(0, 15)); // Keep latest 15 logs
    });

    return () => {
      unsubscribe();
      stopScanner();
    };
  }, []);

  // Update payment amount default on active class selection
  useEffect(() => {
    if (activeGroup) {
      setPaymentAmount(activeGroup.pricePerSession);
      setBookletPaid(false);
      setBookletReceived(false);
    }
  }, [activeGroup]);

  const loadInitData = async () => {
    try {
      // Load groups
      const groupSnap = await getDocs(collection(db, 'classes_groups'));
      const groupsList: ClassGroup[] = [];
      groupSnap.forEach(doc => {
        groupsList.push({ id: doc.id, ...doc.data() } as ClassGroup);
      });
      setGroups(groupsList);

      // Load students
      const studSnap = await getDocs(collection(db, 'students'));
      const studList: Student[] = [];
      studSnap.forEach(doc => {
        studList.push({ id: doc.id, ...doc.data() } as Student);
      });
      setStudents(studList);
    } catch (err) {
      console.error("Init loader failure", err);
    }
  };

  // Select Group meeting & Initialize or load daily dynamic session
  const handleSelectGroup = async (groupId: string) => {
    if (!groupId) {
      setActiveGroup(null);
      setActiveSession(null);
      setActiveSessionId('');
      return;
    }

    const grp = groups.find(g => g.id === groupId);
    if (!grp) return;
    setActiveGroup(grp);

    try {
      // Find if there is an active session for today that is still open
      const sessionsQuery = query(
        collection(db, 'financial_sessions'),
        where('groupId', '==', groupId),
        where('isClosed', '==', false)
      );
      const querySnap = await getDocs(sessionsQuery);
      
      if (!querySnap.empty) {
        // Use existing open session
        const firstDoc = querySnap.docs[0];
        setActiveSessionId(firstDoc.id);
        setActiveSession({ id: firstDoc.id, ...firstDoc.data() } as FinancialSession);
      } else {
        // Spawn a new open session for today
        const payload: FinancialSession = {
          groupId,
          sessionDate: serverTimestamp(),
          totalAttendance: 0,
          totalSessionRevenue: 0,
          totalBookletsSold: 0,
          totalBookletRevenue: 0,
          teacherEarnings: 0,
          centerEarnings: 0,
          cashCollected: 0,
          isClosed: false
        };

        const docRef = await addDoc(collection(db, 'financial_sessions'), payload);
        setActiveSessionId(docRef.id);
        setActiveSession({ id: docRef.id, ...payload });
        onRefreshStats();
      }
    } catch (err) {
      console.error("Session creation error", err);
    }
  };

  // Register New Student Form
  const handleRegisterStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudent.name || !newStudent.phone || !newStudent.parentPhone) return;

    try {
      setIsRegistering(true);
      playBeep(600, 0.05);

      // Generate Auto-Increment Student ID (e.g., std005)
      const nextId = await generateSequentialStudentId();
      
      const payload: Student = {
        studentId: nextId,
        name: newStudent.name,
        phone: newStudent.phone,
        parentPhone: newStudent.parentPhone,
        academicYear: newStudent.academicYear,
        qrCodeData: nextId, // standard QR is bound to code mapping
        createdAt: serverTimestamp()
      };

      // Add to master database collection
      await addDoc(collection(db, 'students'), payload);
      setStudents(prev => [...prev, payload]);
      
      // Select this student immediately to speed workflow
      setSelectedStudent(payload);

      // Reset Form fields
      setNewStudent({
        name: '',
        phone: '',
        parentPhone: '',
        academicYear: 'Grade 10 / الصف الأول الثانوي'
      });

      playBeep(1200, 0.25);
      
      // Dispatch AUTOMATED welcoming WhatsApp message payload
      const logResult = await triggerWhatsAppNotice('registration', payload.name, payload.parentPhone, {
        studentId: payload.studentId,
        qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${payload.studentId}`
      });

      if (logResult && logResult.waLink) {
        setLatestWATrigger({
          name: payload.name,
          type: 'registration',
          phone: payload.parentPhone,
          link: logResult.waLink
        });
        if (autoOpenWA) {
          window.open(logResult.waLink, '_blank');
        }
      }

      setScanStatus({ text: `Onboarded! Student code is: ${payload.studentId}`, type: 'success' });
      setTimeout(() => setScanStatus({ text: '', type: '' }), 5000);

    } catch (err) {
      console.error(err);
      setScanStatus({ text: t.error, type: 'error' });
    } finally {
      setIsRegistering(false);
    }
  };

  // CAMERA SCANNER CONTROL (Html5Qrcode)
  const startScanner = () => {
    setCameraActive(true);
    setTimeout(() => {
      try {
        const scanner = new Html5QrcodeScanner(
          "qr-scanner-element",
          { fps: 15, qrbox: { width: 250, height: 250 } },
          /* verbose= */ false
        );
        scanner.render(onScanSuccess, onScanError);
        scannerRef.current = scanner;
      } catch (err) {
        console.error("Camera startup error", err);
      }
    }, 150);
  };

  const stopScanner = () => {
    setCameraActive(false);
    if (scannerRef.current) {
      try {
        scannerRef.current.clear();
      } catch (e) {
        console.warn("Scanner shutdown cleanup", e);
      }
      scannerRef.current = null;
    }
  };

  const onScanSuccess = (decodedText: string) => {
    processScannedUID(decodedText);
    stopScanner(); // auto stop camera on scan
  };

  const onScanError = (errorMessage: any) => {
    // non-blocking
  };

  const instantSettleAttendance = async (student: Student) => {
    if (!activeSession || !activeGroup || !activeSessionId) return;

    try {
      playBeep(1100, 0.08);
      const sessionPrice = activeGroup.pricePerSession;

      // In fast-mode, we assume default session is paid, and booklet is NOT received yet.
      const attendancePayload: AttendanceLog = {
        studentId: student.studentId,
        studentName: student.name,
        groupId: activeGroup.id!,
        sessionId: activeSessionId,
        timestamp: serverTimestamp(),
        status: 'present',
        isPaid: true,
        paymentAmount: sessionPrice,
        bookletReceived: false,
        bookletPaid: false
      };

      // 1. Create the attendance log entry
      await addDoc(collection(db, 'attendance_logs'), attendancePayload);

      // 2. Accumulate active dynamic session finances
      const currentAttendance = activeSession.totalAttendance + 1;
      const currentRevenue = activeSession.totalSessionRevenue + sessionPrice;
      const currentBookletsSold = activeSession.totalBookletsSold;
      const currentBookletRev = activeSession.totalBookletRevenue;
      const totalCashInDesk = activeSession.cashCollected + sessionPrice;

      const teacherSharePercentage = activeGroup.teacherShare;
      const calculatedTeacherDebt = Number((currentRevenue * (teacherSharePercentage / 100)).toFixed(1));
      const calculatedCenterDebt = Number((currentRevenue - calculatedTeacherDebt).toFixed(1)) + currentBookletRev;

      const sessionUpdate: Partial<FinancialSession> = {
        totalAttendance: currentAttendance,
        totalSessionRevenue: currentRevenue,
        totalBookletsSold: currentBookletsSold,
        totalBookletRevenue: currentBookletRev,
        teacherEarnings: calculatedTeacherDebt,
        centerEarnings: calculatedCenterDebt,
        cashCollected: totalCashInDesk,
      };

      const sessionRef = doc(db, 'financial_sessions', activeSessionId);
      await updateDoc(sessionRef, sessionUpdate);

      // Update local states
      setActiveSession(prev => prev ? { ...prev, ...sessionUpdate } as FinancialSession : null);
      onRefreshStats();

      // Trigger AUTOMATED dynamic parent arrival notification payload
      const logResult = await triggerWhatsAppNotice('attendance', student.name, student.parentPhone, {
        studentId: student.studentId,
        groupName: activeGroup.name,
        timestamp: new Date().toLocaleTimeString()
      });

      if (logResult && logResult.waLink) {
        setLatestWATrigger({
          name: student.name,
          type: 'attendance',
          phone: student.parentPhone,
          link: logResult.waLink
        });
        if (autoOpenWA) {
          window.open(logResult.waLink, '_blank');
        }
      }

      // Show alert sandbox
      playBeep(1400, 0.25);
      showStatusAlert(
        isRtl 
          ? `✅ تم تسجيل الحضور + دفع حصة اليوم (${sessionPrice} ج.م) للطالب: ${student.name}` 
          : `✅ Attendance & Payment settled (${sessionPrice} EGP) for student: ${student.name}`, 
        'success'
      );
      setSelectedStudent(null);
      setSearchQuery('');
    } catch (err) {
      console.error(err);
      showStatusAlert(t.error, 'error');
    }
  };

  // Unified process identifier
  const processScannedUID = (scannedText: string) => {
    // Attempt match studentId or standard name
    const found = students.find(s => s.studentId === scannedText.trim() || s.qrCodeData === scannedText.trim());
    if (found) {
      playBeep(1000, 0.15); // Successful scan sound
      if (fastSettleMode) {
        instantSettleAttendance(found);
      } else {
        setSelectedStudent(found);
        setScanStatus({ text: `Verified Student: ${found.name}`, type: 'success' });
      }
    } else {
      playBeep(400, 0.3); // Error buzz
      setScanStatus({ text: `Unregistered Card Code: "${scannedText}"`, type: 'error' });
    }
  };

  // Submit and Settle Attendance and payment parameters for student in active session
  const handleSubmitAttendance = async () => {
    if (!selectedStudent || !activeSession || !activeGroup || !activeSessionId) return;

    try {
      playBeep(1100, 0.08);
      
      const sessionPrice = activeGroup.pricePerSession;
      const bookletPrice = activeGroup.bookletPrice;

      // Construct attendance record
      const attendancePayload: AttendanceLog = {
        studentId: selectedStudent.studentId,
        studentName: selectedStudent.name,
        groupId: activeGroup.id!,
        sessionId: activeSessionId,
        timestamp: serverTimestamp(),
        status: 'present',
        isPaid: isPaid,
        paymentAmount: isPaid ? paymentAmount : 0,
        bookletReceived: bookletReceived,
        bookletPaid: bookletPaid
      };

      // 1. Create the attendance log entry
      await addDoc(collection(db, 'attendance_logs'), attendancePayload);

      // 2. Adjust booklet stock in classes_groups if student received booklet
      if (bookletReceived && activeGroup.id) {
        const groupRef = doc(db, 'classes_groups', activeGroup.id);
        const decrementedStock = Math.max(0, activeGroup.bookletStock - 1);
        await updateDoc(groupRef, { bookletStock: decrementedStock });
        // Update local state config
        setGroups(prev => prev.map(g => g.id === activeGroup.id ? { ...g, bookletStock: decrementedStock } : g));
        setActiveGroup(prev => prev ? { ...prev, bookletStock: decrementedStock } : null);
      }

      // 3. Accumulate active dynamic session finances
      const currentAttendance = activeSession.totalAttendance + 1;
      const currentRevenue = activeSession.totalSessionRevenue + (isPaid ? paymentAmount : 0);
      const currentBookletsSold = activeSession.totalBookletsSold + (bookletReceived ? 1 : 0);
      const currentBookletRev = activeSession.totalBookletRevenue + (bookletReceived && bookletPaid ? bookletPrice : 0);
      const totalCashInDesk = activeSession.cashCollected + (isPaid ? paymentAmount : 0) + (bookletReceived && bookletPaid ? bookletPrice : 0);

      // Settle Teacher split shares dynamically (e.g. 70% Teacher of attendance revenue, plus booklet margin splits if any, let's keep it simple as requested)
      const teacherSharePercentage = activeGroup.teacherShare;
      const calculatedTeacherDebt = Number((currentRevenue * (teacherSharePercentage / 100)).toFixed(1));
      const calculatedCenterDebt = Number((currentRevenue - calculatedTeacherDebt).toFixed(1)) + currentBookletRev; // Center takes remaining + booklet margins

      const sessionUpdate: Partial<FinancialSession> = {
        totalAttendance: currentAttendance,
        totalSessionRevenue: currentRevenue,
        totalBookletsSold: currentBookletsSold,
        totalBookletRevenue: currentBookletRev,
        teacherEarnings: calculatedTeacherDebt,
        centerEarnings: calculatedCenterDebt,
        cashCollected: totalCashInDesk,
      };

      const sessionRef = doc(db, 'financial_sessions', activeSessionId);
      await updateDoc(sessionRef, sessionUpdate);

      // Update local states
      setActiveSession(prev => prev ? { ...prev, ...sessionUpdate } as FinancialSession : null);
      onRefreshStats();

      // Trigger AUTOMATED dynamic parent arrival notification payload
      const logResult = await triggerWhatsAppNotice('attendance', selectedStudent.name, selectedStudent.parentPhone, {
        studentId: selectedStudent.studentId,
        groupName: activeGroup.name,
        timestamp: new Date().toLocaleTimeString()
      });

      if (logResult && logResult.waLink) {
        setLatestWATrigger({
          name: selectedStudent.name,
          type: 'attendance',
          phone: selectedStudent.parentPhone,
          link: logResult.waLink
        });
        if (autoOpenWA) {
          window.open(logResult.waLink, '_blank');
        }
      }

      // Show alert sandbox
      playBeep(1400, 0.25);
      setScanStatus({ text: `Attendance & Settle recorded! SMS pinged.`, type: 'success' });
      setSelectedStudent(null);
      setSearchQuery('');
      
    } catch (err) {
      console.error(err);
      setScanStatus({ text: t.error, type: 'error' });
    }
  };

  // Close Session and lock finances securely
  const handleLockSession = async () => {
    if (!activeSessionId || !activeSession) return;
    
    try {
      playBeep(450, 0.4);
      const sessionRef = doc(db, 'financial_sessions', activeSessionId);
      await updateDoc(sessionRef, {
        isClosed: true,
        closedAt: serverTimestamp()
      });
      setActiveSession(prev => prev ? { ...prev, isClosed: true } : null);
      showStatusAlert("Daily Meeting Session Frozen & Financial share balance locked.", 'success');
      onRefreshStats();
    } catch (err) {
      console.error(err);
    }
  };

  const showStatusAlert = (text: string, type: string) => {
    setScanStatus({ text, type });
    setTimeout(() => setScanStatus({ text: '', type: '' }), 4000);
  };

  // Filter for manually adding student
  const filteredStudents = searchQuery.trim() === '' 
    ? [] 
    : students.filter(s => 
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        s.studentId.toLowerCase().includes(searchQuery.toLowerCase())
      );

  return (
    <div className="space-y-6 animate-fade-in text-slate-950 font-sans">
      
      {/* Alert Overlay */}
      {scanStatus.text && (
        <div className={`p-4 rounded-xl text-center font-bold text-xs shadow-xs border transition-all ${
          scanStatus.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
            : 'bg-rose-50 text-rose-800 border-rose-200'
        }`}>
          {scanStatus.text}
        </div>
      )}

      {/* FREE EASY 1-CLICK WHATSAPP OVERLAY */}
      {latestWATrigger && (
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="p-4 bg-emerald-50 border-2 border-emerald-500 rounded-xl space-y-3 shadow-lg flex flex-col md:flex-row items-center justify-between text-slate-900 transition-all"
        >
          <div className="text-center md:text-left rtl:md:text-right space-y-1">
            <p className="font-extrabold text-emerald-990 text-xs flex items-center justify-center md:justify-start gap-1.5 leading-relaxed">
              <span>🟢</span>
              <span>{isRtl ? 'زر إرسال الرسالة المجانية بالواتساب!' : 'Free WhatsApp Sender Key:'}</span>
            </p>
            <p className="text-[10px] text-slate-600">
              {isRtl 
                ? `اضغط أدناه لفتح المحادثة وإرسال نص ${latestWATrigger.type === 'registration' ? 'الترحيب والاشتراك' : 'إثبات حضور اليوم'} لولي أمر الطالب: ` 
                : `Click below to open chat and dispatch the prefilled ${latestWATrigger.type === 'registration' ? 'Welcome' : 'Attendance Confirmation'} message to `}
              <strong className="text-slate-950 font-extrabold">{latestWATrigger.name}</strong> ({latestWATrigger.phone})
            </p>
          </div>
          <div className="flex gap-2 w-full md:w-auto shrink-0 justify-center">
            <a
              href={latestWATrigger.link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setLatestWATrigger(null)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-750 text-white font-extrabold rounded-xl text-xs transition-all shadow-md shadow-emerald-600/25 cursor-pointer flex items-center gap-1.5 font-sans"
            >
              💬 {isRtl ? 'إرسال الرسالة مجاناً بالكامل' : 'Send Free 1-Click'}
            </a>
            <button
              onClick={() => setLatestWATrigger(null)}
              className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              {isRtl ? 'تخطي' : 'Dismiss'}
            </button>
          </div>
        </motion.div>
      )}

      {/* DYNAMIC SESSION ENCOMPASS SELECTION */}
      <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-1">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.activeSession}</label>
          <p className="text-xs text-slate-500">Pick active learning tier group to unlock laser scan cashier processing</p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
          {/* Fast Instant Settle mode toggle */}
          <div className="flex items-center gap-2 bg-indigo-50 text-indigo-800 border border-indigo-150 rounded-xl px-3.5 py-2 cursor-pointer select-none hover:bg-indigo-100/60 transition-all">
            <input
              type="checkbox"
              id="fast-settle-mode"
              checked={fastSettleMode}
              onChange={(e) => toggleFastSettleMode(e.target.checked)}
              className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
            />
            <label htmlFor="fast-settle-mode" className="text-[11px] font-extrabold cursor-pointer whitespace-nowrap">
              {isRtl ? '🚀 وضع السكرتارية (حضور فوري)' : '🚀 Quick Settle Mode'}
            </label>
          </div>

          {/* Free automated WhatsApp toggle */}
          <div className="flex items-center gap-2 bg-emerald-50 text-emerald-800 border border-emerald-150 rounded-xl px-3.5 py-2 cursor-pointer select-none hover:bg-emerald-100/60 transition-all">
            <input
              type="checkbox"
              id="auto-open-wa"
              checked={autoOpenWA}
              onChange={(e) => toggleAutoOpenWA(e.target.checked)}
              className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
            />
            <label htmlFor="auto-open-wa" className="text-[11px] font-extrabold cursor-pointer whitespace-nowrap">
              {isRtl ? '⚡ الفتح التلقائي لوتساب فور المسح' : '⚡ Auto-Open Chat'}
            </label>
          </div>

          <select
            value={activeGroup ? activeGroup.id : ''}
            onChange={(e) => handleSelectGroup(e.target.value)}
            className="bg-slate-50/50 border border-slate-200 text-slate-700 px-4 py-2 rounded-xl text-xs focus:outline-none focus:ring-4 focus:ring-indigo-100 font-semibold cursor-pointer transition-all"
          >
            <option value="">{t.selectGroup}</option>
            {groups.map(grp => (
              <option key={grp.id} value={grp.id}>{grp.name}</option>
            ))}
          </select>

          {activeGroup && (
            <button
              onClick={handleOpenPrintModal}
              className="bg-indigo-50 border border-indigo-200 hover:bg-indigo-600 hover:text-white text-indigo-800 rounded-xl py-2 px-3.5 text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
              title={isRtl ? 'توليد وطباعة كروت الطلاب التعريفية الذكية' : 'Generate & Print Smart Student ID Cards'}
            >
              <Printer className="w-3.5 h-3.5 text-indigo-600 hover:text-white" />
              <span>{isRtl ? 'طباعة الكروت والـ QR' : 'Print Group QR'}</span>
            </button>
          )}

          {activeSession && !activeSession.isClosed && (
            <button
              onClick={handleLockSession}
              className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl py-2 px-4 text-xs font-bold shadow-xs transition-colors flex items-center justify-center space-x-1"
            >
              <CameraOff className="w-3.5 h-3.5" />
              <span>{t.closeSession}</span>
            </button>
          )}
        </div>
      </div>

      {activeGroup && activeSession ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* HIGH-SPEED Settle SCANNERS */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* ACTIVE SESSION METRICS */}
            <div className="bg-slate-900 text-white p-5 rounded-xl border border-slate-800 shadow-sm grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Active Group</span>
                <p className="text-xs font-bold truncate mt-1 text-slate-100">{activeGroup.name}</p>
              </div>
              <div className="border-l border-slate-850 pl-4 rtl:border-l-0 rtl:border-r rtl:pl-0 rtl:pr-4">
                <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">{t.totalAttendanceShort}</span>
                <p className="text-base font-extrabold font-mono mt-0.5 text-slate-100">{activeSession.totalAttendance}</p>
              </div>
              <div className="border-l border-slate-850 pl-4 rtl:border-l-0 rtl:border-r rtl:pl-0 rtl:pr-4">
                <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Cash Collected</span>
                <p className="text-base font-extrabold font-mono mt-0.5 text-emerald-400">{activeSession.cashCollected} EGP</p>
              </div>
              <div className="border-l border-slate-850 pl-4 rtl:border-l-0 rtl:border-r rtl:pl-0 rtl:pr-4">
                <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Booklet Stock</span>
                <p className="text-base font-extrabold font-mono mt-0.5 text-amber-500">{activeGroup.bookletStock}</p>
              </div>
            </div>

            {/* DUAL MODE SCAN ELEMENT */}
            <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-xs space-y-6">
              <div className="flex justify-between items-center bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                <div>
                  <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center space-x-2 rtl:space-x-reverse">
                    <QrCode className="w-4 h-4 text-indigo-500" />
                    <span>{t.scanAttendance}</span>
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">Toggle webcam or run simulation clicks underneath</p>
                </div>
                
                <button
                  onClick={() => cameraActive ? stopScanner() : startScanner()}
                  disabled={activeSession.isClosed}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center space-x-1.5 cursor-pointer ${
                    cameraActive 
                      ? 'bg-rose-100 text-rose-700 hover:bg-rose-200' 
                      : 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50'
                  }`}
                >
                  {cameraActive ? <CameraOff className="w-3.5 h-3.5" /> : <Camera className="w-3.5 h-3.5" />}
                  <span>{cameraActive ? t.stopScanning : t.startScanning}</span>
                </button>
              </div>

              {/* CAMERA FEED ELEMENT */}
              {cameraActive && (
                <div className="max-w-md mx-auto aspect-square bg-slate-950 rounded-xl overflow-hidden border border-slate-850 shadow-inner relative flex items-center justify-center">
                  <div id="qr-scanner-element" className="w-full h-full"></div>
                </div>
              )}

              {/* QUICK SCAN SELECT / MANUAL SEARCH PANEL */}
              {!activeSession.isClosed && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t.searchAndScanLabel}</p>
                    {fastSettleMode && (
                      <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 text-[9px] font-extrabold px-2.5 py-0.5 rounded-lg flex items-center gap-1.5 animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                        {isRtl ? '🚀 وضع الحضور التلقائي الفوري نشط' : '🚀 Instant Settle Active'}
                      </span>
                    )}
                  </div>
                  
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute top-3 left-3 text-slate-400 rtl:left-auto rtl:right-3" />
                    <input 
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={t.searchStudent}
                      className="w-full bg-slate-50/40 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs focus:outline-none focus:ring-4 focus:ring-indigo-100 rtl:pl-4 rtl:pr-9 transition-all"
                    />
                  </div>

                  {/* Manual search dropdown */}
                  {filteredStudents.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 max-h-52 overflow-y-auto space-y-0.5">
                      {filteredStudents.map(student => (
                        <button
                          key={student.studentId}
                          onClick={() => processScannedUID(student.studentId)}
                          className="w-full text-left rtl:text-right px-3 py-2 hover:bg-indigo-50/50 rounded-lg flex justify-between items-center text-xs transition-colors"
                        >
                          <div>
                            <span className="font-bold text-slate-900 block">{student.name}</span>
                            <span className="text-[9px] text-slate-400 font-mono block mt-0.5">{student.academicYear}</span>
                          </div>
                          <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded-md font-mono text-[10px] font-bold tracking-tight">
                            {student.studentId}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* VIRTUAL SIMULATOR CONSOLE */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 space-y-3">
                    <span className="text-[10px] text-indigo-700 font-extrabold uppercase tracking-wider block">⭐ High-Speed Scan Simulator</span>
                    <p className="text-[10px] text-slate-400 leading-relaxed">No camera? Select any student from the quick-simulator deck below to instantly process gate authentication:</p>
                    
                    <div className="flex flex-wrap gap-1.5">
                      {students.map(std => (
                        <button
                          key={std.studentId}
                          onClick={() => processScannedUID(std.studentId)}
                          className="px-2.5 py-1.5 bg-white hover:bg-indigo-50/50 border border-slate-200 hover:border-indigo-200 text-[10px] font-bold rounded-lg transition-colors font-mono shadow-xs flex items-center space-x-1"
                        >
                          <span>{std.name}</span>
                          <span className="text-slate-400 font-medium">({std.studentId})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* STUDENT TARIFF ATTENDANCE PAYMENT FORM */}
            {selectedStudent && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white p-5 rounded-xl border border-slate-200 shadow-md shadow-slate-100/40 space-y-6"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <span className="text-[9px] text-emerald-600 font-extrabold tracking-wider uppercase">Active Scanned Card Details</span>
                    <h4 className="text-base font-extrabold text-slate-900 mt-0.5">{selectedStudent.name}</h4>
                    <p className="text-[10px] text-slate-400 font-semibold">{selectedStudent.academicYear}</p>
                  </div>
                  <div className="text-right font-mono">
                    <span className="bg-indigo-50 text-indigo-800 px-2.5 py-0.5 rounded-md text-[10px] font-bold">
                      {selectedStudent.studentId}
                    </span>
                    <p className="text-[9px] text-slate-400 mt-1">Parent: {selectedStudent.parentPhone}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  {/* SESSION PAYMENT CASHIER */}
                  <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-150 space-y-4">
                    <h5 className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5 rtl:space-x-reverse">
                      <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{t.revenueSplits}</span>
                    </h5>
                    
                    <div className="flex items-center space-x-3 rtl:space-x-reverse">
                      <input 
                        type="checkbox"
                        id="session-paid-box"
                        checked={isPaid}
                        onChange={(e) => {
                          setIsPaid(e.target.checked);
                          setPaymentAmount(e.target.checked ? activeGroup.pricePerSession : 0);
                        }}
                        className="w-4 h-4 accent-indigo-600 cursor-pointer rounded"
                      />
                      <label htmlFor="session-paid-box" className="text-xs font-bold text-slate-700 select-none cursor-pointer">
                        Mark Class Fee Paid (Collect {activeGroup.pricePerSession} EGP)
                      </label>
                    </div>

                    {isPaid && (
                      <div>
                        <label className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">{t.paymentAmount}</label>
                        <input 
                          type="number"
                          value={paymentAmount}
                          onChange={(e) => setPaymentAmount(Number(e.target.value))}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none"
                        />
                      </div>
                    )}
                  </div>

                  {/* PAMPHLET / BOOKLET (الملازم) LOGISTICS */}
                  <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-150 space-y-4">
                    <h5 className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5 rtl:space-x-reverse">
                      <BookOpen className="w-3.5 h-3.5 text-orange-500" />
                      <span>Material booklet Distribution</span>
                    </h5>

                    <div className="space-y-3">
                      <div className="flex items-center space-x-3 rtl:space-x-reverse">
                        <input 
                          type="checkbox"
                          id="booklet-received-box"
                          checked={bookletReceived}
                          onChange={(e) => setBookletReceived(e.target.checked)}
                          className="w-4 h-4 accent-indigo-600 cursor-pointer rounded"
                        />
                        <label htmlFor="booklet-received-box" className="text-xs font-bold text-slate-700 select-none cursor-pointer">
                          Student Received Booklet (-1 stock count)
                        </label>
                      </div>

                      {bookletReceived && (
                        <div className="flex items-center space-x-3 rtl:space-x-reverse animated fade-in pl-4 rtl:pl-0 rtl:pr-4">
                          <input 
                            type="checkbox"
                            id="booklet-paid-box"
                            checked={bookletPaid}
                            onChange={(e) => setBookletPaid(e.target.checked)}
                            className="w-4 h-4 accent-orange-600 cursor-pointer rounded"
                          />
                          <label htmlFor="booklet-paid-box" className="text-xs font-bold text-orange-700 select-none cursor-pointer">
                            Booklet price collected (+ {activeGroup.bookletPrice} EGP)
                          </label>
                        </div>
                      )}
                    </div>
                  </div>

                </div>

                <div className="flex space-x-3 rtl:space-x-reverse">
                  <button
                    onClick={() => setSelectedStudent(null)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl py-2.5 text-xs transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmitAttendance}
                    className="flex-[2] bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl py-2.5 text-xs shadow-xs transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Confirm Attendance & Settle Cash</span>
                  </button>
                </div>
              </motion.div>
            )}

          </div>

          {/* TELEMETRY TELEGRAM STREAM & QUICK REGISTER */}
          <div className="space-y-6">
            
            {/* REGISTER STUDENT ELEMENT */}
            <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-xs space-y-4">
              <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center space-x-2 rtl:space-x-reverse border-b border-slate-100 pb-3">
                <UserPlus className="w-4 h-4 text-indigo-500" />
                <span>{t.addStudent}</span>
              </h3>

              <form onSubmit={handleRegisterStudent} className="space-y-4 text-xs font-medium font-sans">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{t.studentName}</label>
                  <input 
                    type="text"
                    value={newStudent.name}
                    onChange={(e) => setNewStudent(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Abdelrahaman Hassan"
                    required
                    className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{t.mobile}</label>
                  <input 
                    type="text"
                    value={newStudent.phone}
                    onChange={(e) => setNewStudent(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="01012345678"
                    required
                    className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{t.parentPhone}</label>
                  <input 
                    type="text"
                    value={newStudent.parentPhone}
                    onChange={(e) => setNewStudent(prev => ({ ...prev, parentPhone: e.target.value }))}
                    placeholder="01212345678"
                    required
                    className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{t.academicYear}</label>
                  <select 
                    value={newStudent.academicYear}
                    onChange={(e) => setNewStudent(prev => ({ ...prev, academicYear: e.target.value }))}
                    className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all font-semibold"
                  >
                    <option value="Grade 10 / الأول الثانوي">Grade 10 / الأول الثانوي</option>
                    <option value="Grade 11 / الثاني الثانوي">Grade 11 / الثاني الثانوي</option>
                    <option value="Grade 12 / الثالث الثانوي">Grade 12 / الثالث الثانوي</option>
                  </select>
                </div>

                <button 
                  type="submit"
                  disabled={isRegistering}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-2.5 font-bold shadow-xs flex items-center justify-center space-x-1.5 cursor-pointer transition-colors mt-2"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>{isRegistering ? t.loading : t.addStudent}</span>
                </button>
              </form>
            </div>

            {/* WHATSAPP OUTGOING WEBHOOK WEB TELEMETRY STREAM */}
            <div className="bg-slate-900 text-slate-100 p-5 rounded-xl border border-slate-800 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center space-x-1.5 rtl:space-x-reverse">
                  <Radio className="w-3.5 h-3.5 text-emerald-400 " />
                  <span>{t.whatsappLog}</span>
                </h4>
                <span className="text-[8px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-mono font-bold uppercase">webhook gateway stream</span>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">{t.whatsAppLogDesc}</p>

              <div className="space-y-2 max-h-56 overflow-y-auto font-mono text-[9px] pt-1">
                {whatsappLogs.length === 0 ? (
                  <p className="text-center text-slate-500 py-6">Waiting for scanner webhook dispatch triggers...</p>
                ) : (
                  whatsappLogs.map((log, index) => (
                    <div key={index} className="p-3 bg-slate-950 border border-slate-850 rounded-lg space-y-1.5 animate-pulse-once">
                      <div className="flex justify-between items-center text-[9px]">
                        <span className="font-bold text-indigo-400">To: {log.recipientPhone} ({log.recipientName})</span>
                        <div className="flex items-center space-x-2 rtl:space-x-reverse">
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                            log.status === 'sent' 
                              ? 'bg-emerald-500/20 text-emerald-400' 
                              : log.status === 'simulated_sent'
                              ? 'bg-amber-500/20 text-amber-400'
                              : 'bg-rose-500/20 text-rose-400'
                          }`}>
                            {log.status === 'sent' 
                              ? (isRtl ? 'تم الإرسال فعلياً' : 'Sent Live') 
                              : log.status === 'simulated_sent'
                              ? (isRtl ? 'محاكاة تجريبية' : 'Simulated')
                              : (isRtl ? 'فشل الإرسال' : 'Failed')}
                          </span>
                          <span className="text-slate-500">{log.timestamp}</span>
                        </div>
                      </div>
                      <p className="text-emerald-400 italic">" {log.payloadBody.body} "</p>
                      <div className="text-[8px] text-slate-500 pt-1 border-t border-slate-900 flex justify-between items-center gap-2">
                        <div className="truncate flex-1 font-mono">
                          <p className="truncate">URL: {log.endpointUrl}</p>
                          <p className="truncate">Token: {log.payloadBody.token ? `${log.payloadBody.token.substring(0, 12)}***` : '—'}</p>
                        </div>
                        {log.waLink && (
                          <a
                            href={log.waLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-emerald-600/90 hover:bg-emerald-500 text-white font-bold py-1 px-2 rounded-lg font-sans text-[8px] transition-all cursor-pointer flex items-center gap-1 shrink-0"
                          >
                            💬 {isRtl ? 'إرسال مجاني' : 'Free Send'}
                          </a>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

        </div>
      ) : (
        <div className="bg-white p-12 text-center rounded-xl border border-slate-200/90 shadow-xs">
          <p className="text-slate-400 font-bold text-xs">Please select an academic Course Group first in the selector above to activate scanning!</p>
        </div>
      )}

      {/* 1. DYNAMIC PRINT CUSTOM CSS INJECTOR */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #print-area, #print-area * {
            visibility: visible !important;
          }
          #print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background-color: #ffffff !important;
          }
          .custom-print-grid {
            display: grid !important;
            grid-template-columns: repeat(${printColumns}, 1fr) !important;
            gap: 6mm !important;
            padding: 8mm !important;
            box-sizing: border-box !important;
          }
          .print-card-box {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            background: #ffffff !important;
            box-shadow: none !important;
            margin: 0 auto !important;
          }
        }
      `}</style>

      {/* 2. DEDICATED PRINT AREA (HIDDEN FROM WEB SCREEN VIEW, ONLY VISIBLE IN PRINTER ENVIRONMENT) */}
      <div id="print-area" className="hidden print:block bg-white min-h-screen text-slate-900 leading-normal font-sans" dir={isRtl ? 'rtl' : 'ltr'}>
        <div className="custom-print-grid">
          {students.filter(s => selectedPrintStudents.includes(s.studentId)).map(student => (
            <div 
              key={student.studentId}
              className={`print-card-box border bg-white flex flex-col justify-between p-3 select-none relative ${
                printShowBorder ? 'border-dashed border-slate-300' : 'border-transparent'
              } ${
                printCardSize === 'small' 
                  ? 'w-[75mm] h-[48mm]' 
                  : printCardSize === 'badge'
                  ? 'w-[85mm] h-[55mm]' 
                  : 'w-[100mm] h-[65mm]'
              } rounded-2xl overflow-hidden`}
              style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}
            >
              {/* Card top banner branding */}
              <div className="flex items-start justify-between gap-2.5">
                <div className="space-y-0.5 text-right rtl:text-right">
                  <span className="text-[10px] font-black tracking-wider text-indigo-600 block leading-tight border-b border-indigo-100 pb-0.5">
                    {printCenterName}
                  </span>
                  <h4 className="text-[12px] font-extrabold text-slate-900 mt-1 truncate max-w-[170px] inline-block font-sans">
                    {student.name}
                  </h4>
                  {printShowAcademicYear && (
                    <span className="text-[9px] text-slate-500 block font-semibold truncate max-w-[170px]">
                      {student.academicYear}
                    </span>
                  )}
                </div>
                <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-extrabold shrink-0 text-xs font-mono">
                  {student.studentId}
                </div>
              </div>

              {/* Card info rows */}
              <div className="flex items-end justify-between gap-2 mt-auto">
                <div className="space-y-0.5 text-right rtl:text-right">
                  {printShowPhone && (
                    <div className="text-[9px] text-slate-500 leading-tight">
                      <span className="text-[8px] font-bold uppercase tracking-wider block text-slate-400">
                        {isRtl ? 'هاتف ولي الأمر' : 'Parent Phone'}
                      </span>
                      <span className="font-mono font-bold text-slate-700">{student.parentPhone}</span>
                    </div>
                  )}
                  <div className="text-[9px] text-slate-500 leading-tight">
                    <span className="text-[8px] font-bold uppercase tracking-wider block text-slate-400">
                      {isRtl ? 'كود الحضور بالـ QR' : 'Attendance QR ID'}
                    </span>
                    <span className="font-mono font-extrabold text-indigo-600 tracking-wider">
                      {student.studentId}
                    </span>
                  </div>
                </div>
                
                {/* Embedded QR Code */}
                <div className="w-16 h-16 bg-white border border-slate-150 p-1 rounded-xl flex items-center justify-center shrink-0 shadow-2xs">
                  {qrUrls[student.studentId] ? (
                    <img 
                      src={qrUrls[student.studentId]} 
                      alt={`QR Code ${student.studentId}`} 
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="w-full h-full bg-slate-100 shrink-0 text-[8px] flex items-center justify-center">Loading</div>
                  )}
                </div>
              </div>

              {/* Card bottom design border line */}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600"></div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. INTERACTIVE WEB SCREEN VIEW ID CARD MANAGER MODAL */}
      {showPrintModal && (
        <div className="fixed inset-0 bg-slate-905/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto animate-fade-in print:hidden" style={{ contentVisibility: 'auto' }}>
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-6xl w-full flex flex-col max-h-[90vh] overflow-hidden"
          >
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-150 bg-slate-50 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                  <IdCard className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 text-left rtl:text-right">
                    {isRtl ? `توليد طباعة كروت الـ QR لطلاب: ${activeGroup?.name}` : `Generate & Print QR ID Cards: ${activeGroup?.name}`}
                  </h3>
                  <p className="text-[10px] text-slate-400 text-left rtl:text-right">
                    {isRtl ? 'اختر الطلاب وخصص نمط الكروت ثم انقر على بدء الطباعة' : 'Choose students, customize layout templates, and trigger native system printing'}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowPrintModal(false)}
                className="p-1.5 hover:bg-slate-200 text-slate-400 hover:text-slate-600 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body (Columns grid) */}
            <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
              {/* Setup column parameters */}
              <div className="lg:col-span-4 p-5 overflow-y-auto border-r border-slate-100 flex flex-col space-y-5 text-xs">
                
                {/* 1. BRAND CONFIGURATOR */}
                <div className="space-y-2 text-left rtl:text-right">
                  <span className="text-[9px] font-black text-indigo-650 uppercase tracking-wider">{isRtl ? 'اسم السنتر على الكارت' : 'Center Name (On Badge)'}</span>
                  <input
                    type="text"
                    value={printCenterName}
                    onChange={(e) => {
                      setPrintCenterName(e.target.value);
                      localStorage.setItem('printed_center_name', e.target.value);
                    }}
                    placeholder="e.g. مركز التميز"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs focus:ring-4 focus:ring-indigo-100 focus:outline-none focus:border-indigo-400 font-bold"
                  />
                </div>

                {/* 2. TEMPLATE LAYOUT DESIGN */}
                <div className="bg-slate-50/50 p-3.5 rounded-xl border border-slate-150 space-y-3 text-left rtl:text-right">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5 justify-start">
                    <Sliders className="w-3 h-3" />
                    {isRtl ? 'تخصيص الهيكل والنمط' : 'Card Design Controls'}
                  </span>
                  
                  {/* Cards Size toggle options */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400">{isRtl ? 'حجم كرت الطالب' : 'Card Dimensions'}</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['small', 'badge', 'standard'] as const).map(size => (
                        <button
                          key={size}
                          onClick={() => setPrintCardSize(size)}
                          className={`py-1.5 rounded-lg text-[10px] font-black border transition-all cursor-pointer ${
                            printCardSize === size 
                              ? 'bg-indigo-650 border-indigo-600 bg-indigo-600 text-white shadow-2xs' 
                              : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-600'
                          }`}
                        >
                          {size === 'small' ? (isRtl ? 'صغير' : 'Small') : size === 'badge' ? (isRtl ? 'كرت هوية' : 'Credit') : (isRtl ? 'كبير' : 'Large')}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Columns toggle */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400">{isRtl ? 'عدد كروت في الصف' : 'Grid Print Columns'}</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[1, 2, 3].map(col => (
                        <button
                          key={col}
                          onClick={() => setPrintColumns(col)}
                          className={`py-1.5 rounded-lg text-[10px] font-black border transition-all cursor-pointer ${
                            printColumns === col 
                              ? 'bg-indigo-650 border-indigo-600 bg-indigo-600 text-white shadow-2xs' 
                              : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-600'
                          }`}
                        >
                          {col} {isRtl ? 'أعمدة' : 'Cols'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Toggles */}
                  <div className="space-y-2 pt-2 border-t border-slate-150">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input 
                        type="checkbox" 
                        checked={printShowBorder}
                        onChange={(e) => setPrintShowBorder(e.target.checked)}
                        className="w-4 h-4 accent-indigo-600 cursor-pointer rounded"
                      />
                      <span className="font-semibold text-[10px] text-slate-700">{isRtl ? 'إظهار حدود قص الكروت منقطة' : 'Dotted cutting lines'}</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input 
                        type="checkbox" 
                        checked={printShowPhone}
                        onChange={(e) => setPrintShowPhone(e.target.checked)}
                        className="w-4 h-4 accent-indigo-600 cursor-pointer rounded"
                      />
                      <span className="font-semibold text-[10px] text-slate-700">{isRtl ? 'طباعة رقم هاتف ولي الأمر' : 'Include parent details'}</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input 
                        type="checkbox" 
                        checked={printShowAcademicYear}
                        onChange={(e) => setPrintShowAcademicYear(e.target.checked)}
                        className="w-4 h-4 accent-indigo-600 cursor-pointer rounded"
                      />
                      <span className="font-semibold text-[10px] text-slate-700">{isRtl ? 'طباعة المرحلة الدراسية للطالب' : 'Include academic year stage'}</span>
                    </label>
                  </div>
                </div>

                {/* 3. STUDENTS SELECTION CHECKLIST */}
                <div className="flex-1 flex flex-col min-h-[170px] space-y-2 text-left rtl:text-right">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{isRtl ? 'طلاب المجموعة للطباعة' : 'Students Checklist'}</span>
                    <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md text-[9px] font-black">
                      {selectedPrintStudents.length} / {students.length} {isRtl ? 'طالب' : ''}
                    </span>
                  </div>

                  {/* Filter switches buttons */}
                  <div className="grid grid-cols-3 gap-1">
                    <button 
                      onClick={() => {
                        setSelectedPrintStudents(students.map(s => s.studentId));
                      }}
                      className="text-[9px] font-extrabold bg-slate-100 hover:bg-slate-200 py-1.5 rounded-lg border border-slate-200 transition-colors text-slate-750 font-sans cursor-pointer"
                    >
                      {isRtl ? 'تحديد الكل' : 'Check All'}
                    </button>
                    <button 
                      onClick={() => {
                        setSelectedPrintStudents([]);
                      }}
                      className="text-[9px] font-extrabold bg-slate-100 hover:bg-slate-200 py-1.5 rounded-lg border border-slate-200 transition-colors text-slate-755 font-sans cursor-pointer"
                    >
                      {isRtl ? 'إلغاء الكل' : 'Clear All'}
                    </button>
                    <button 
                      onClick={() => {
                        const normalize = (txt: string) => {
                          return txt
                            .replace(/أ/g, 'ا')
                            .replace(/إ/g, 'ا')
                            .replace(/آ/g, 'ا')
                            .replace(/ة/g, 'ه')
                            .replace(/ى/g, 'ي')
                            .toLowerCase();
                        };
                        const grpName = normalize(activeGroup?.name || '');
                        const isFirstSec = grpName.includes('اول') || grpName.includes('10') || grpName.includes('one') || grpName.includes('الاول');
                        const isSecondSec = grpName.includes('ثاني') || grpName.includes('تاني') || grpName.includes('11') || grpName.includes('two') || grpName.includes('الثاني');
                        const isThirdSec = grpName.includes('ثالث') || grpName.includes('تالت') || grpName.includes('12') || grpName.includes('three') || grpName.includes('الثالث');

                        const matched = students.filter(student => {
                          const studentYear = normalize(student.academicYear || '');
                          if (isFirstSec && (studentYear.includes('اول') || studentYear.includes('10') || studentYear.includes('الاول'))) return true;
                          if (isSecondSec && (studentYear.includes('ثاني') || studentYear.includes('تاني') || studentYear.includes('11') || studentYear.includes('الثاني'))) return true;
                          if (isThirdSec && (studentYear.includes('ثالث') || studentYear.includes('تالت') || studentYear.includes('12') || studentYear.includes('الثالث'))) return true;
                          
                          const words = studentYear.split(/\s+/);
                          return words.some(w => w.length > 2 && grpName.includes(w));
                        }).map(s => s.studentId);
                        
                        setSelectedPrintStudents(matched);
                      }}
                      className="text-[9px] font-extrabold bg-indigo-50 hover:bg-indigo-100 py-1.5 rounded-lg border border-indigo-100 transition-colors text-indigo-805 font-sans cursor-pointer"
                    >
                      {isRtl ? 'المجموعة الحالية' : 'Group Match'}
                    </button>
                  </div>

                  {/* Student search query filter */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute top-2.5 left-2.5 text-slate-400" />
                    <input
                      type="text"
                      value={printSearchQuery}
                      onChange={(e) => setPrintSearchQuery(e.target.value)}
                      placeholder={isRtl ? 'ابحث باسم أو كود الطالب...' : 'Search Students...'}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-[11px] focus:outline-none focus:ring-2 focus:ring-indigo-100 font-sans"
                    />
                  </div>

                  {/* Student scrolling checklist */}
                  <div className="flex-1 bg-slate-50 rounded-xl border border-slate-200 overflow-y-auto max-h-[160px] p-2 space-y-1">
                    {students
                      .filter(s => {
                        if (!printSearchQuery.trim()) return true;
                        return (
                          s.name.toLowerCase().includes(printSearchQuery.toLowerCase()) ||
                          s.studentId.toLowerCase().includes(printSearchQuery.toLowerCase()) ||
                          s.academicYear.toLowerCase().includes(printSearchQuery.toLowerCase())
                        );
                      })
                      .map(student => {
                        const checked = selectedPrintStudents.includes(student.studentId);
                        return (
                          <div 
                            key={student.studentId}
                            onClick={() => {
                              setSelectedPrintStudents(prev => 
                                checked 
                                  ? prev.filter(id => id !== student.studentId)
                                  : [...prev, student.studentId]
                              );
                            }}
                            className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all select-none border ${
                              checked ? 'bg-indigo-50/50 border-indigo-100 text-slate-900' : 'bg-white border-slate-100 hover:bg-slate-50 text-slate-500'
                            }`}
                          >
                            <div className="flex items-center gap-2 text-right rtl:text-right">
                              <input 
                                type="checkbox"
                                checked={checked}
                                readOnly
                                className="w-3.5 h-3.5 accent-indigo-605 cursor-pointer rounded"
                              />
                              <div>
                                <p className="font-extrabold text-[11px] leading-snug">{student.name}</p>
                                <p className="text-[9.5px] text-slate-400 font-mono font-black">{student.studentId} • {student.academicYear}</p>
                              </div>
                            </div>
                            {/* Matching tag indicator */}
                            {(() => {
                              const normalize = (txt: string) => {
                                return txt
                                  .replace(/أ/g, 'ا')
                                  .replace(/إ/g, 'ا')
                                  .replace(/آ/g, 'ا')
                                  .replace(/ة/g, 'ه')
                                  .replace(/ى/g, 'ي')
                                  .toLowerCase();
                              };
                              const grpName = normalize(activeGroup?.name || '');
                              const studentYear = normalize(student.academicYear || '');
                              const words = studentYear.split(/\s+/);
                              const isMatch = words.some(w => w.length > 2 && grpName.includes(w));
                              return isMatch && (
                                <span className="bg-emerald-50 text-emerald-800 border border-emerald-100 text-[8px] font-extrabold px-1.5 py-0.5 rounded leading-none shrink-0 font-sans">
                                  {isRtl ? 'مطابق' : 'Match'}
                                </span>
                              );
                            })()}
                          </div>
                        );
                      })}
                  </div>
                </div>

              </div>

              {/* Dynamic Live Paper Mock Preview */}
              <div className="lg:col-span-8 bg-slate-900 p-6 flex flex-col overflow-hidden">
                <div className="flex justify-between items-center mb-3 text-xs font-semibold text-slate-200">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-505 bg-indigo-400 animate-pulse"></span>
                    {isRtl ? 'معاينة ورقة الطباعة التفاعلية الحية (A4 Standard)' : 'Interactive Virtual A4 Preview Sheet'}
                  </span>
                  <span className="text-slate-400 text-[10px] font-mono leading-none">
                    {isRtl ? 'تخطيط مرن مع المعيار والقص دليلي' : 'Realistic physical paper card borders'}
                  </span>
                </div>

                <div className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl overflow-auto p-4 md:p-8 flex justify-center shadow-inner relative">
                  {/* Outer shadow visual layout sheet */}
                  <div className="bg-white min-h-[297mm] w-full max-w-[210mm] shadow-2xl p-6 relative select-none rounded-lg" style={{ boxSizing: 'border-box' }} dir={isRtl ? 'rtl' : 'ltr'}>
                    
                    {/* Header Watermark in preview */}
                    <div className="border-b border-dashed border-slate-200 pb-3 mb-6 text-center text-slate-400 text-[9px] font-black flex justify-between items-center leading-none">
                      <span>{isRtl ? '🖨️ أعلى الصفحة (A4 Standard Margin)' : '🖨️ A4 Standard Top Boundary'}</span>
                      <span className="font-mono">{printCenterName}</span>
                      <span>{selectedPrintStudents.length} {isRtl ? 'كارت محدد للطباعة' : 'Cards Checked'}</span>
                    </div>

                    {selectedPrintStudents.length === 0 ? (
                      <div className="flex flex-col items-center justify-center min-h-[300px] text-slate-300">
                        <Printer className="w-12 h-12 stroke-1 text-indigo-400 animate-bounce" />
                        <p className="font-extrabold text-sm mt-3 text-slate-400">{isRtl ? 'لم تختر أي طالب للطباعة بعد' : 'No student selected for cards!'}</p>
                        <p className="text-[11px] text-slate-400 mt-1">{isRtl ? 'حدد الطلاب من القائمة الجانبية لتغذية ورقة المعاينة' : 'Select target student names from the list to display virtual tags'}</p>
                      </div>
                    ) : (
                      <div className="grid gap-3.5" style={{ gridTemplateColumns: `repeat(${printColumns}, 1fr)` }}>
                        {students
                          .filter(s => selectedPrintStudents.includes(s.studentId))
                          .map(student => (
                            <div 
                              key={student.studentId}
                              className={`border bg-white flex flex-col justify-between p-3 select-none relative group ${
                                printShowBorder ? 'border-dashed border-slate-300' : 'border-transparent'
                              } ${
                                printCardSize === 'small' 
                                  ? 'w-full min-h-[48mm]' 
                                  : printCardSize === 'badge'
                                  ? 'w-full min-h-[55mm]' 
                                  : 'w-full min-h-[65mm]'
                              } rounded-2xl shadow-2xs hover:shadow-indigo-100 hover:border-indigo-400 transition-all duration-300 overflow-hidden text-slate-900`}
                            >
                              {/* Overlay deselect banner */}
                              <div className="absolute inset-0 bg-rose-50/95 backdrop-blur-3xs opacity-0 hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-3 text-center cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedPrintStudents(prev => prev.filter(id => id !== student.studentId));
                                }}
                              >
                                <X className="w-6 h-6 text-rose-500 stroke-2 mb-1 shrink-0" />
                                <span className="text-[10px] text-rose-700 font-extrabold leading-none">{isRtl ? 'استبعاد من الطباعة' : 'Exclude Student'}</span>
                              </div>

                              {/* Card layout body */}
                              <div className="flex items-start justify-between gap-2.5">
                                <div className="space-y-0.5 text-right rtl:text-right">
                                  <span className="text-[9px] font-black tracking-wider text-indigo-600 block leading-tight border-b border-indigo-100 pb-0.5">
                                    {printCenterName}
                                  </span>
                                  <h4 className="text-[11px] font-black text-slate-850 mt-1 truncate max-w-[120px] inline-block font-sans line-clamp-1">
                                    {student.name}
                                  </h4>
                                  {printShowAcademicYear && (
                                    <span className="text-[8px] text-slate-500 block font-semibold truncate max-w-[120px]">
                                      {student.academicYear}
                                    </span>
                                  )}
                                </div>
                                <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-500 font-bold shrink-0 text-xs font-mono">
                                  {student.studentId}
                                </div>
                              </div>

                              {/* Row bottom detail block elements */}
                              <div className="flex items-end justify-between gap-1.5 mt-4">
                                <div className="space-y-0.5 text-right rtl:text-right">
                                  {printShowPhone && (
                                    <div className="text-[8px] text-slate-500 leading-tight">
                                      <span className="text-[7px] font-bold uppercase tracking-wider block text-slate-450 leading-none mb-0.5">
                                        {isRtl ? 'هاتف ولي الأمر' : 'Parent Phone'}
                                      </span>
                                      <span className="font-mono font-bold text-slate-700">{student.parentPhone}</span>
                                    </div>
                                  )}
                                  <div className="text-[8px] text-slate-500 leading-tight">
                                    <span className="text-[7px] font-bold uppercase tracking-wider block text-slate-450 leading-none mb-0.5">
                                      {isRtl ? 'كود الطالب للحضور' : 'Student QR ID'}
                                    </span>
                                    <span className="font-mono font-black text-indigo-700 tracking-wider">
                                      {student.studentId}
                                    </span>
                                  </div>
                                </div>
                                
                                {/* Base64 inline preview QR Code */}
                                <div className="w-13 h-13 bg-white border border-slate-150 p-0.5 rounded-xl flex items-center justify-center shrink-0">
                                  {qrUrls[student.studentId] ? (
                                    <img 
                                      src={qrUrls[student.studentId]} 
                                      alt={`QR code`} 
                                      className="w-full h-full object-contain"
                                    />
                                  ) : (
                                    <div className="w-full h-full bg-slate-50 text-[6px] shrink-0 font-medium flex items-center justify-center animate-pulse">Loading</div>
                                  )}
                                </div>
                              </div>
                              
                              {/* Beautiful accent bottom bar indicator */}
                              <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 to-purple-500"></div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-150 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium text-left rtl:text-right">
                <Info className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span>{isRtl ? 'تلميح: اختر "حفظ كـ PDF" أو "طباعة" من نافذة المتصفح المنبثقة' : 'Tip: Choose "Save as PDF" directly in native printer box'}</span>
              </div>
              <div className="flex gap-2.5">
                <button
                  onClick={() => setShowPrintModal(false)}
                  className="px-4 py-2 bg-white border border-slate-200 text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-50 text-xs font-bold transition-all cursor-pointer font-sans"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  onClick={() => {
                    playBeep(1200, 0.15);
                    window.print();
                  }}
                  disabled={selectedPrintStudents.length === 0}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-extrabold rounded-xl text-xs transition-all flex items-center gap-1.5 shadow-md shadow-indigo-600/25 cursor-pointer font-sans"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{isRtl ? 'بدأ طباعة البطاقات' : 'Print Cards & QR'}</span>
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

    </div>
  );
}
