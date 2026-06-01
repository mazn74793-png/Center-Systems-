/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  collection, 
  getDocs, 
  setDoc, 
  doc, 
  getDoc,
  addDoc,
  serverTimestamp 
} from 'firebase/firestore';
import { db, auth, googleProvider } from './lib/firebase';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { translations } from './translations';
import { UserRole } from './types';
import AdminDashboard from './components/AdminDashboard';
import TeacherDashboard from './components/TeacherDashboard';
import AssistantDashboard from './components/AssistantDashboard';
import { 
  Shield, 
  BookOpen, 
  Camera, 
  Globe, 
  Database, 
  Sparkles, 
  GraduationCap,
  LogOut,
  Lock
} from 'lucide-react';
import { motion } from 'motion/react';

export default function App() {
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [currentRole, setCurrentRole] = useState<UserRole>(UserRole.ADMIN);
  const [centerName, setCenterName] = useState<string>('سنتر الرواد التعليمي');
  const [isSeeding, setIsSeeding] = useState(false);
  const [systemStats, setSystemStats] = useState({
    studentsCount: 0,
    groupsCount: 0,
    teachersCount: 0
  });

  // Auth States
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [isProfileReady, setIsProfileReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const isRtl = lang === 'ar';
  const t = translations[lang];

  // A. Observe Firebase Authentication state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentFirebaseUser) => {
      setAuthError(null);
      if (currentFirebaseUser) {
        try {
          setUser(currentFirebaseUser);
          // Check-Create user profile
          const profileRef = doc(db, 'user_profiles', currentFirebaseUser.uid);
          const profileSnap = await getDoc(profileRef);
          
          if (!profileSnap.exists()) {
            const isAdminEmail = currentFirebaseUser.email === "motaem23y@gmail.com";
            const assignedRole = isAdminEmail ? 'admin' : 'assistant';
            
            await setDoc(profileRef, {
              uid: currentFirebaseUser.uid,
              name: currentFirebaseUser.displayName || currentFirebaseUser.email?.split('@')[0] || 'Operator',
              email: currentFirebaseUser.email || '',
              role: assignedRole
            });
            
            console.log(`Successfully bootstrapped ${assignedRole} profile for social credential.`);
            setCurrentRole(assignedRole as UserRole);
          } else {
            const roleInProfile = profileSnap.data()?.role;
            if (roleInProfile) {
              setCurrentRole(roleInProfile as UserRole);
            }
          }
          setIsProfileReady(true);
        } catch (error) {
          console.error("Profile synchronization error:", error);
          setIsProfileReady(true); // Keep going to allow viewing
        }
      } else {
        setUser(null);
        setIsProfileReady(false);
      }
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      setAuthError(null);
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error("Failed Google Sign-In Popup:", error);
      setAuthError(error?.message || "Authentication attempt rejected.");
    }
  };

  const handleQuickDemoLogin = () => {
    // Beautiful bypass for sandboxed iframe environments
    const demoUser = {
      uid: "demo-admin-uid",
      displayName: "زائر سنتر الصفوة (Demo)",
      email: "motaem23y@gmail.com",
    } as any;
    setUser(demoUser);
    setCurrentRole(UserRole.ADMIN);
    setIsProfileReady(true);
  };

  // 1. DYNAMIC SYSTEM AUTO-SEED CHECK FOR NEW DATABASES
  useEffect(() => {
    if (!user || !isProfileReady) return;

    const checkAndSeedSystem = async () => {
      try {
        setIsSeeding(true);
        
        // Let's inspect teachers collection to check database status
        const teachersSnap = await getDocs(collection(db, 'teachers'));
        
        if (teachersSnap.empty) {
          console.log("Empty database detected. Initiating beautiful pre-seed mock records...");
          
          // A. Seed Config Singleton
          await setDoc(doc(db, 'centers_config', 'main_config'), {
            name: 'سنتر الصفوة التعليمي (Al-Safwa)',
            currency: 'EGP',
            whatsappEnabled: true,
            whatsappApiUrl: 'https://api.ultramsg.com/v1/messages/chat',
            whatsappToken: '6x9b8t7v6u5y4t3r',
            whatsappInstanceId: 'inst5051',
            welcomeTemplate: 'مرحباً بك {student_name} في سنتر الصفوة! كود الطالب الخاص بك هو {student_id}. يرجى إبراز هذا الكود للحضور والغياب.',
            attendanceTemplate: 'عزيزي ولي الأمر، نحيطكم علماً بأن الطالب: {student_name} قد حضر الآن حصة المستر للمجموعة الدراسية {group_name}. إشعار تلقائي.'
          });

          // B. Seed Teachers
          const teach1 = await addDoc(collection(db, 'teachers'), {
            name: 'الأستاذ أحمد رأفت (Mr. Ahmed)',
            phone: '01011223344',
            subject: 'Physics / فيزياء أولى ثانوي',
            defaultShare: 70
          });

          const teach2 = await addDoc(collection(db, 'teachers'), {
            name: 'الأستاذة منى علي (Miss Mona)',
            phone: '01222334455',
            subject: 'Arabic / لغة عربية ثانوية عامة',
            defaultShare: 65
          });

          // C. Seed Class Groups matching teachers
          const grp1 = await addDoc(collection(db, 'classes_groups'), {
            teacherId: teach1.id,
            name: 'مجموعة الفيزياء - الأحد الساعة 5 مساءً',
            pricePerSession: 80,
            bookletPrice: 30,
            bookletCost: 10,
            bookletStock: 120,
            teacherShare: 70,
            schedule: 'الأحد - الساعة 05:00 م'
          });

          const grp2 = await addDoc(collection(db, 'classes_groups'), {
            teacherId: teach2.id,
            name: 'مجموعة اللغة العربية - الإثنين الساعة 3 مساءً',
            pricePerSession: 100,
            bookletPrice: 40,
            bookletCost: 15,
            bookletStock: 80,
            teacherShare: 65,
            schedule: 'الإثنين - الساعة 03:00 م'
          });

          // D. Seed Standard Database Counter
          await setDoc(doc(db, 'centers_config', 'student_counter'), { count: 3 });

          // E. Seed Students with custom beautiful continuous IDs
          await addDoc(collection(db, 'students'), {
            studentId: 'std001',
            name: 'عبدالرحمن حسن مصطفى',
            phone: '01055566677',
            parentPhone: '01099988877',
            academicYear: 'Grade 10 / الأول الثانوي',
            qrCodeData: 'std001',
            createdAt: serverTimestamp()
          });

          await addDoc(collection(db, 'students'), {
            studentId: 'std002',
            name: 'نور أحمد عبد الله',
            phone: '01122233344',
            parentPhone: '01011122233',
            academicYear: 'Grade 11 / الثاني الثانوي',
            qrCodeData: 'std002',
            createdAt: serverTimestamp()
          });

          await addDoc(collection(db, 'students'), {
            studentId: 'std003',
            name: 'مريم محمود سلامة',
            phone: '01288899900',
            parentPhone: '01544433322',
            academicYear: 'Grade 12 / الثالث الثانوي',
            qrCodeData: 'std003',
            createdAt: serverTimestamp()
          });

          // F. Seed initial finished Financial Sessions
          await addDoc(collection(db, 'financial_sessions'), {
            groupId: grp1.id,
            sessionDate: serverTimestamp(),
            totalAttendance: 12,
            totalSessionRevenue: 960, // 12 * 80 EGP
            totalBookletsSold: 10,
            totalBookletRevenue: 300, // 10 * 30 EGP
            teacherEarnings: 672, // 70% of 960
            centerEarnings: 588, // remaining 288 + booklet rev 300
            cashCollected: 1260,
            isClosed: true,
            closedAt: serverTimestamp()
          });

          // G. Seed general Operational Expense ledger
          await addDoc(collection(db, 'center_expenses'), {
            category: 'Salaries',
            amount: 250,
            description: 'يومية المساعدين وبوابة فحص الباركود',
            date: serverTimestamp(),
            addedBy: 'Super Admin'
          });

          console.log("Pre-seed operation completed index green!");
        }

        // Fetch Stats for Top Bar Summary
        loadSystemHeaderStats();

      } catch (err) {
        console.error("Database seed checks failed: ", err);
      } finally {
        setIsSeeding(false);
      }
    };

    checkAndSeedSystem();
  }, [user, isProfileReady]);

  const loadSystemHeaderStats = async () => {
    if (!user) return;
    try {
      const configSnap = await getDocs(collection(db, 'centers_config'));
      configSnap.forEach(doc => {
        if (doc.id === 'main_config') {
          setCenterName(doc.data().name || 'بوابة السنتر التعليمي');
        }
      });

      const students = await getDocs(collection(db, 'students'));
      const groups = await getDocs(collection(db, 'classes_groups'));
      const teachers = await getDocs(collection(db, 'teachers'));
      
      setSystemStats({
        studentsCount: students.size,
        groupsCount: groups.size,
        teachersCount: teachers.size
      });
    } catch (err) {
      console.warn("Stats aggregator error", err);
    }
  };

  if (loadingAuth) {
    return (
      <div 
        dir={isRtl ? 'rtl' : 'ltr'}
        className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans select-none"
      >
        <div className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 border-4 border-indigo-200 rounded-full animate-pulse"></div>
            <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
          </div>
          <h2 className="text-sm font-bold text-slate-800 tracking-wide uppercase font-sans animate-pulse">{t.loading}</h2>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div 
        dir={isRtl ? 'rtl' : 'ltr'}
        className="min-h-screen bg-slate-100 flex items-center justify-center p-4 sm:p-6 md:p-8 font-sans transition-all duration-300 select-none bg-gradient-to-tr from-slate-100 via-white to-slate-50"
      >
        <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200/85 shadow-xl shadow-slate-100/50 p-6 sm:p-8 space-y-8 relative overflow-hidden">
          {/* Subtle upper background accent */}
          <div className="absolute top-0 inset-x-0 h-1.5 bg-indigo-600"></div>

          <div className="text-center space-y-3">
            <div className="mx-auto w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-xl font-extrabold shadow-sm border border-indigo-100 shadow-indigo-100">
              E
            </div>
            <div className="space-y-1">
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight leading-none">{t.loginTitle}</h1>
              <p className="text-xs text-slate-500 font-semibold pt-1">{t.loginSub}</p>
            </div>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed text-center font-medium px-2">
            {t.tagline}
          </p>

          <div className="space-y-4">
            <button
               onClick={handleGoogleSignIn}
               className="w-full flex items-center justify-center gap-3 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-bold py-3 px-4 rounded-xl text-xs shadow-md shadow-indigo-600/15 cursor-pointer transition-all border border-indigo-500/20"
            >
              <Lock className="w-4 h-4 text-indigo-200" />
              <span>{isRtl ? 'تسجيل الدخول باستخدام حساب جوجل' : 'Sign in with Google Account'}</span>
            </button>

            <button
               onClick={handleQuickDemoLogin}
               className="w-full flex items-center justify-center gap-3 bg-emerald-50 hover:bg-emerald-100/80 active:scale-[0.98] text-emerald-800 border border-emerald-200 font-bold py-3 px-4 rounded-xl text-xs cursor-pointer transition-all shadow-sm"
            >
              <Sparkles className="w-4 h-4 text-emerald-600 animate-pulse" />
              <span>{isRtl ? 'دخول سريع للتجربة والمُعاينة (بدون حساب)' : 'Quick Demo Sandbox Sign-In (No Account)'}</span>
            </button>

            {authError && (
              <div className="p-3 bg-rose-50 text-rose-800 text-[10px] font-semibold rounded-lg text-center leading-normal border border-rose-105">
                {authError}
              </div>
            )}
          </div>

          <div className="pt-6 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider font-mono">
            <span>Enterprise Gateway</span>
            <button
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              className="text-indigo-600 hover:text-indigo-700 hover:underline cursor-pointer"
            >
              {lang === 'ar' ? 'English' : 'العربية'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      dir={isRtl ? 'rtl' : 'ltr'} 
      className="min-h-screen bg-slate-50 flex flex-col lg:flex-row transition-all duration-300 font-sans"
    >
      
      {/* 2. ENTERPRISE SIDEBAR NAVIGATION */}
      <aside className="w-full lg:w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 border-b lg:border-b-0 lg:border-r border-slate-800">
        {/* Sidebar Brand Header */}
        <div className="p-6 flex items-center justify-between lg:justify-start gap-3 border-b border-slate-800/60 select-none">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-extrabold text-lg shadow-md shadow-indigo-600/20">
              {centerName.trim().charAt(0) || 'E'}
            </div>
            <div>
              <span className="text-white font-bold text-sm tracking-tight block truncate max-w-[130px]" title={centerName}>
                {centerName}
              </span>
              <span className="text-[9px] text-slate-500 font-black uppercase tracking-wider block font-mono">Enterprise Hub</span>
            </div>
          </div>
          
          {isSeeding && (
            <span className="text-[8px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded font-extrabold animate-pulse">
              Seeding...
            </span>
          )}
        </div>

        {/* Sidebar Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <div className="text-slate-500 text-[10px] uppercase font-bold px-2 py-2 tracking-widest font-mono">
            {isRtl ? 'صلاحيات الإدارة والتحكم' : 'Core Management'}
          </div>

          {/* Admin Role Link */}
          <button
            onClick={() => setCurrentRole(UserRole.ADMIN)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              currentRole === UserRole.ADMIN
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/15 font-bold'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Shield className="w-4 h-4 shrink-0 text-indigo-400" />
            <span className="truncate">{t.adminTitle.split(' ')[0]}</span>
          </button>

          {/* Teacher Role Link */}
          <button
            onClick={() => setCurrentRole(UserRole.TEACHER)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              currentRole === UserRole.TEACHER
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/15 font-bold'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <BookOpen className="w-4 h-4 shrink-0 text-indigo-400" />
            <span className="truncate">{t.teacherTitle.split(' ')[0]}</span>
          </button>

          {/* Assistant Role Link */}
          <button
            onClick={() => setCurrentRole(UserRole.ASSISTANT)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              currentRole === UserRole.ASSISTANT
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/15 font-bold'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Camera className="w-4 h-4 shrink-0 text-indigo-400" />
            <span className="truncate">Assistant Gate</span>
          </button>

          <div className="pt-4 text-slate-500 text-[10px] uppercase font-bold px-2 py-2 tracking-widest font-mono">
            {isRtl ? 'عدادات وإحصائيات فورية' : 'Live Tally counters'}
          </div>
          <div className="px-3 py-2.5 space-y-2 text-[11px] text-slate-400 bg-slate-950/40 rounded-xl border border-slate-800/40 select-none">
            <div className="flex justify-between items-center">
              <span className="flex items-center gap-1.5 font-sans">
                <Database className="w-3.5 h-3.5 text-indigo-400" /> 
                {isRtl ? 'الطلاب:' : 'Students List:'}
              </span>
              <span className="font-bold text-slate-100 font-mono">{systemStats.studentsCount}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="flex items-center gap-1.5 font-sans">
                <Globe className="w-3.5 h-3.5 text-indigo-400" />
                {isRtl ? 'المجموعات:' : 'Active Groups:'}
              </span>
              <span className="font-bold text-slate-100 font-mono">{systemStats.groupsCount}</span>
            </div>
          </div>
        </nav>

        {/* Sidebar Footer Info & Lang Trigger */}
        <div className="p-4 border-t border-slate-800 space-y-3 bg-slate-950/20 select-none">
          <div className="flex items-center gap-2 px-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider font-mono">
              WA GATEWAY: ACTIVE
            </span>
          </div>

          <div className="space-y-2">
            <button
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              className="w-full flex items-center justify-between px-3 py-2 bg-slate-800 hover:bg-slate-700/80 active:scale-[0.98] rounded-xl text-xs text-white font-semibold transition-all cursor-pointer border border-slate-700/30"
            >
              <span className="flex items-center gap-1.5 font-sans">
                <Globe className="w-3.5 h-3.5 text-slate-400" />
                {isRtl ? 'English Version' : 'عربي بالكامل'}
              </span>
              <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded font-bold">
                {lang === 'ar' ? 'EN' : 'AR'}
              </span>
            </button>

            <button
              onClick={() => signOut(auth)}
              className="w-full flex items-center justify-between px-3 py-2 bg-slate-950/30 hover:bg-rose-955/20 hover:text-rose-300 group rounded-xl text-xs text-rose-400 font-bold transition-all cursor-pointer border border-slate-850 hover:border-rose-900/10 font-sans"
            >
              <span className="flex items-center gap-1.5 font-sans">
                <Shield className="w-3.5 h-3.5 text-rose-500/80 group-hover:text-rose-400 transition-colors" />
                {isRtl ? 'إنهاء الجلسة والخروج' : 'Logout Portal'}
              </span>
            </button>
          </div>
        </div>
      </aside>

      {/* RIGHT SIDE / MAIN WORKING ZONE */}
      <main className="flex-1 flex flex-col min-w-0 min-h-screen overflow-x-hidden bg-slate-50">
        {/* Top Header of Main panel */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 sm:px-8 shrink-0 select-none">
          <div className="flex items-center gap-3">
            <h2 className="font-extrabold text-slate-800 text-sm sm:text-md uppercase tracking-tight flex items-center gap-2">
              {currentRole === UserRole.ADMIN && t.adminTitle}
              {currentRole === UserRole.TEACHER && t.teacherTitle}
              {currentRole === UserRole.ASSISTANT && t.assistantTitle}
            </h2>
            <span className="hidden sm:inline-block px-2 py-0.5 bg-blue-50 text-blue-700 text-[9px] font-black rounded border border-blue-100 uppercase font-mono tracking-wider">
              ENTERPRISE V3.2
            </span>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex flex-col items-end text-right rtl:text-left rtl:items-start select-none">
              <span className="text-xs font-bold text-slate-900 block truncate max-w-[150px]">
                {isRtl ? 'حساب السوبر أدمن' : 'Welcome, Administrator'}
              </span>
              <span className="text-[9px] text-indigo-500 font-bold uppercase tracking-widest block font-mono">
                {currentRole} Role
              </span>
            </div>
            <div className="w-9 h-9 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-700 font-extrabold text-xs shadow-inner">
              {currentRole.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        {/* Console view body stage */}
        <div className="flex-grow p-4 sm:p-8 max-w-7xl w-full mx-auto overflow-y-auto space-y-6">
          {/* Visual Header Spark Notice */}
          <div className="bg-gradient-to-r from-indigo-50 to-indigo-100/40 p-4 rounded-2xl border border-indigo-100/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shadow-xs">
            <div className="flex items-center space-x-2.5 rtl:space-x-reverse">
              <Sparkles className="w-4 h-4 text-indigo-600 animate-pulse shrink-0" />
              <p className="text-xs text-indigo-950 font-semibold leading-none">
                <strong>{isRtl ? 'التدفق التشغيلي: ' : 'Active Operational Stream: '}</strong> 
                {currentRole === UserRole.ADMIN && t.adminTitle}
                {currentRole === UserRole.TEACHER && t.teacherTitle}
                {currentRole === UserRole.ASSISTANT && t.assistantTitle}
              </p>
            </div>
            <span className="text-[9px] bg-indigo-600 text-white font-mono font-extrabold px-2.5 py-1 rounded-full uppercase">
              {currentRole} ACTIVE
            </span>
          </div>

          {/* Dashboards Swaps */}
          {currentRole === UserRole.ADMIN && (
            <AdminDashboard 
              t={t} 
              isRtl={isRtl} 
              onRefreshStats={loadSystemHeaderStats} 
            />
          )}

          {currentRole === UserRole.TEACHER && (
            <TeacherDashboard 
              t={t} 
              isRtl={isRtl} 
            />
          )}

          {currentRole === UserRole.ASSISTANT && (
            <AssistantDashboard 
              t={t} 
              isRtl={isRtl} 
              onRefreshStats={loadSystemHeaderStats} 
            />
          )}
        </div>

        {/* App footer credentials */}
        <footer className="bg-white border-t border-slate-200 py-5 text-center text-[11px] text-slate-400 font-semibold shrink-0">
          <p>© 2026 {centerName}. Fully integrated with Google Cloud Firestore Enterprise Edition.</p>
        </footer>
      </main>
    </div>
  );
}
