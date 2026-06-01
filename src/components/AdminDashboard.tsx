/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  collection, 
  getDocs, 
  addDoc, 
  doc, 
  setDoc, 
  getDoc,
  query,
  where,
  serverTimestamp 
} from 'firebase/firestore';
import { 
  db, 
  handleFirestoreError, 
  OperationType 
} from '../lib/firebase';
import { 
  Student, 
  Teacher, 
  ClassGroup, 
  CenterExpense, 
  CenterConfig, 
  TranslationKeys 
} from '../types';
import { 
  DollarSign, 
  BookOpen, 
  Users, 
  Settings, 
  Plus, 
  TrendingUp, 
  Smartphone, 
  UserPlus, 
  Calendar, 
  Layers 
} from 'lucide-react';
import { motion } from 'motion/react';

interface AdminDashboardProps {
  t: TranslationKeys;
  isRtl: boolean;
  onRefreshStats: () => void;
}

export default function AdminDashboard({ t, isRtl, onRefreshStats }: AdminDashboardProps) {
  // Config state
  const [config, setConfig] = useState<CenterConfig>({
    name: 'Al-Rowad Center',
    currency: 'EGP',
    whatsappEnabled: true,
    whatsappMode: 'free_wa_link',
    whatsappApiUrl: 'https://api.ultramsg.com/v1/messages/chat',
    whatsappToken: '',
    whatsappInstanceId: '',
    welcomeTemplate: 'Welcome {student_name}! Your student ID is {student_id}. Show this message for attendance.',
    attendanceTemplate: 'Dear parent, your student {student_name} has arrived at the center for class {group_name}.'
  });

  // DB Entity states
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [groups, setGroups] = useState<ClassGroup[]>([]);
  const [expenses, setExpenses] = useState<CenterExpense[]>([]);
  const [studentsCount, setStudentsCount] = useState(0);

  // Stats calculations
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalExpensesValue, setTotalExpensesValue] = useState(0);

  // Form states
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ text: '', type: '' });

  // New Teacher form
  const [newTeacher, setNewTeacher] = useState({ name: '', phone: '', subject: '', defaultShare: 70 });
  
  // New Group form
  const [newGroup, setNewGroup] = useState({
    teacherId: '',
    name: '',
    pricePerSession: 80,
    bookletPrice: 30,
    bookletCost: 10,
    bookletStock: 100,
    teacherShare: 70,
    schedule: 'Saturday & Tuesday 5:00 PM'
  });

  // New Expense form
  const [newExpense, setNewExpense] = useState({
    category: 'Rent' as any,
    amount: 0,
    description: ''
  });

  // Load Admin Data from Firestore
  useEffect(() => {
    loadAdminData();
  }, []);

  const showStatus = (text: string, type: 'success' | 'error') => {
    setStatusMsg({ text, type });
    setTimeout(() => setStatusMsg({ text: '', type: '' }), 4000);
  };

  const loadAdminData = async () => {
    try {
      setLoading(true);

      // Load config singleton
      const configSnap = await getDoc(doc(db, 'centers_config', 'main_config'));
      if (configSnap.exists()) {
        setConfig(configSnap.data() as CenterConfig);
      } else {
        // Create initial default config
        await setDoc(doc(db, 'centers_config', 'main_config'), config);
      }

      // Load Teachers
      const teacherSnap = await getDocs(collection(db, 'teachers'));
      const teachersList: Teacher[] = [];
      teacherSnap.forEach(doc => {
        teachersList.push({ id: doc.id, ...doc.data() } as Teacher);
      });
      setTeachers(teachersList);

      // Load Class Groups
      const groupSnap = await getDocs(collection(db, 'classes_groups'));
      const groupsList: ClassGroup[] = [];
      groupSnap.forEach(doc => {
        groupsList.push({ id: doc.id, ...doc.data() } as ClassGroup);
      });
      setGroups(groupsList);

      // Load Expenses
      const expenseSnap = await getDocs(collection(db, 'center_expenses'));
      const expensesList: CenterExpense[] = [];
      let totalExp = 0;
      expenseSnap.forEach(doc => {
        const data = doc.data();
        totalExp += data.amount || 0;
        expensesList.push({ id: doc.id, ...data } as CenterExpense);
      });
      setExpenses(expensesList);
      setTotalExpensesValue(totalExp);

      // Load Students Count
      const studentSnap = await getDocs(collection(db, 'students'));
      setStudentsCount(studentSnap.size);

      // Load Attendance Logs for Student Payment aggregates
      const logSnap = await getDocs(collection(db, 'attendance_logs'));
      let rev = 0;
      logSnap.forEach(doc => {
        const data = doc.data();
        rev += (data.paymentAmount || 0);
        // If booklet is paid separately and not included in paymentAmount:
        if (data.bookletPaid && data.bookletReceived) {
          // Booklet price from corresponding group is tracked, let's keep it in total
        }
      });
      setTotalRevenue(rev);

    } catch (err) {
      console.error(err);
      showStatus(t.error, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Submit Save Config
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await setDoc(doc(db, 'centers_config', 'main_config'), config);
      showStatus(t.success, 'success');
      onRefreshStats();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'centers_config/main_config');
    } finally {
      setLoading(false);
    }
  };

  // Onboard Teacher
  const handleOnboardTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeacher.name || !newTeacher.subject) return;

    try {
      setLoading(true);
      const docRef = await addDoc(collection(db, 'teachers'), {
        name: newTeacher.name,
        phone: newTeacher.phone,
        subject: newTeacher.subject,
        defaultShare: Number(newTeacher.defaultShare)
      });

      // Update local dropdowns state
      setTeachers(prev => [...prev, { id: docRef.id, ...newTeacher }]);
      setNewTeacher({ name: '', phone: '', subject: '', defaultShare: 70 });
      showStatus(t.success, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'teachers');
    } finally {
      setLoading(false);
    }
  };

  // Onboard Class Group
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroup.name || !newGroup.teacherId) {
      showStatus("Please pick a teacher and write a group name", 'error');
      return;
    }

    try {
      setLoading(true);
      const payload = {
        teacherId: newGroup.teacherId,
        name: newGroup.name,
        pricePerSession: Number(newGroup.pricePerSession),
        bookletPrice: Number(newGroup.bookletPrice),
        bookletCost: Number(newGroup.bookletCost),
        bookletStock: Number(newGroup.bookletStock),
        teacherShare: Number(newGroup.teacherShare),
        schedule: newGroup.schedule
      };

      const docRef = await addDoc(collection(db, 'classes_groups'), payload);
      setGroups(prev => [...prev, { id: docRef.id, ...payload }]);
      setNewGroup(prev => ({ ...prev, name: '', schedule: 'Saturday & Tuesday 5:00 PM' }));
      showStatus(t.success, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'classes_groups');
    } finally {
      setLoading(false);
    }
  };

  // Log Expense Voucher
  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newExpense.amount <= 0 || !newExpense.description) return;

    try {
      setLoading(true);
      const payload = {
        category: newExpense.category,
        amount: Number(newExpense.amount),
        description: newExpense.description,
        date: serverTimestamp(),
        addedBy: 'Super Admin'
      };

      const docRef = await addDoc(collection(db, 'center_expenses'), payload);
      setExpenses(prev => [{ id: docRef.id, ...payload, date: new Date() }, ...prev]);
      setTotalExpensesValue(prev => prev + payload.amount);
      setNewExpense({ category: 'Rent', amount: 0, description: '' });
      showStatus(t.success, 'success');
      onRefreshStats();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'center_expenses');
    } finally {
      setLoading(false);
    }
  };

  const netProfit = totalRevenue - totalExpensesValue;

  return (
    <div className="space-y-6 animate-fade-in text-slate-950 font-sans">
      
      {/* Alert Messaging */}
      {statusMsg.text && (
        <div className={`p-4 rounded-xl text-center font-semibold text-xs shadow-xs border-l-4 transition-all ${
          statusMsg.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border-emerald-500' 
            : 'bg-rose-50 text-rose-800 border-rose-500'
        }`}>
          {statusMsg.text}
        </div>
      )}

      {/* METRICS CARD STRAP */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        
        <motion.div 
          whileHover={{ y: -2 }}
          className="bg-white p-5 rounded-xl border border-slate-200/85 shadow-xs flex items-center space-x-4 rtl:space-x-reverse"
        >
          <div className="p-3 bg-sky-50 text-sky-600 rounded-lg">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.studentList}</p>
            <p className="text-2xl font-extrabold tracking-tight mt-0.5 font-mono">{studentsCount}</p>
          </div>
        </motion.div>

        <motion.div 
          whileHover={{ y: -2 }}
          className="bg-white p-5 rounded-xl border border-slate-200/85 shadow-xs flex items-center space-x-4 rtl:space-x-reverse"
        >
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.totalRevenue}</p>
            <p className="text-2xl font-extrabold tracking-tight text-emerald-600 mt-0.5 font-mono">
              {totalRevenue} <span className="text-xs font-medium text-slate-400">{config.currency}</span>
            </p>
          </div>
        </motion.div>

        <motion.div 
          whileHover={{ y: -2 }}
          className="bg-white p-5 rounded-xl border border-slate-200/85 shadow-xs flex items-center space-x-4 rtl:space-x-reverse"
        >
          <div className="p-3 bg-rose-50 text-rose-600 rounded-lg">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.totalExpenses}</p>
            <p className="text-2xl font-extrabold tracking-tight text-rose-600 mt-0.5 font-mono">
              {totalExpensesValue} <span className="text-xs font-medium text-slate-400">{config.currency}</span>
            </p>
          </div>
        </motion.div>

        <motion.div 
          whileHover={{ y: -2 }}
          className="bg-slate-900 p-5 rounded-xl text-white shadow-md flex items-center space-x-4 rtl:space-x-reverse"
        >
          <div className="p-3 bg-indigo-500/20 text-indigo-300 rounded-lg">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.netProfit}</p>
            <p className={`text-2xl font-extrabold tracking-tight mt-0.5 font-mono ${netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {netProfit} <span className="text-xs font-medium text-slate-400">{config.currency}</span>
            </p>
          </div>
        </motion.div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT COLUMN: REGISTRIES & ENTITIES */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* TEACHERS REGISTRY */}
          <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-xs space-y-5">
            <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center space-x-2 rtl:space-x-reverse border-b border-slate-100 pb-3">
              <BookOpen className="w-4 h-4 text-indigo-500" />
              <span>{t.registerTeacher}</span>
            </h3>

            <form onSubmit={handleOnboardTeacher} className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">{t.studentName}</label>
                <input 
                  type="text" 
                  value={newTeacher.name} 
                  onChange={(e) => setNewTeacher(prev => ({ ...prev, name: e.target.value }))}
                  required
                  placeholder="Mr. Ahmed Refaat"
                  className="w-full bg-slate-50/50 hover:bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl px-3 py-2 text-xs transition-all outline-none focus:ring-4 focus:ring-indigo-100"
                />
              </div>
              <div>
                <label className="block text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">{t.mobile}</label>
                <input 
                  type="text" 
                  value={newTeacher.phone} 
                  onChange={(e) => setNewTeacher(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="01012345678"
                  className="w-full bg-slate-50/50 hover:bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl px-3 py-2 text-xs transition-all outline-none focus:ring-4 focus:ring-indigo-100"
                />
              </div>
              <div>
                <label className="block text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">{t.subject}</label>
                <input 
                  type="text" 
                  value={newTeacher.subject} 
                  onChange={(e) => setNewTeacher(prev => ({ ...prev, subject: e.target.value }))}
                  placeholder="Physics / فيزياء"
                  required
                  className="w-full bg-slate-50/50 hover:bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl px-3 py-2 text-xs transition-all outline-none focus:ring-4 focus:ring-indigo-100"
                />
              </div>
              <div className="flex items-end">
                <button 
                  type="submit" 
                  className="w-full bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white rounded-xl py-2 text-xs font-bold shadow-xs flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Onboard</span>
                </button>
              </div>
            </form>

            {/* List existing teachers */}
            <div className="overflow-x-auto rounded-xl border border-slate-200/60">
              <table className="w-full text-left rtl:text-right text-xs text-slate-500">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-slate-200/80 text-slate-600 font-bold">
                    <th className="py-2.5 px-4">{t.studentName}</th>
                    <th className="py-2.5 px-3">{t.subject}</th>
                    <th className="py-2.5 px-3">{t.mobile}</th>
                    <th className="py-2.5 px-3 text-center">{t.defaultSharePct}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {teachers.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-slate-400 font-medium">{t.noData}</td>
                    </tr>
                  ) : (
                    teachers.map((teacher) => (
                      <tr key={teacher.id} className="hover:bg-slate-50/40 text-slate-700 font-medium transition-colors">
                        <td className="py-3 px-4 text-slate-900 font-bold">{teacher.name}</td>
                        <td className="py-3 px-3">{teacher.subject}</td>
                        <td className="py-3 px-3 font-mono text-[11px] text-slate-500">{teacher.phone || '—'}</td>
                        <td className="py-3 px-3 text-center text-indigo-600 font-bold font-mono">{teacher.defaultShare}%</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

          </div>

          {/* GROUPS MANAGEMENT */}
          <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-xs space-y-5">
            <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center space-x-2 rtl:space-x-reverse border-b border-slate-100 pb-3">
              <Calendar className="w-4 h-4 text-indigo-500" />
              <span>{t.createGroup}</span>
            </h3>

            <form onSubmit={handleCreateGroup} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">{t.selectTeacher}</label>
                <select 
                  value={newGroup.teacherId}
                  onChange={(e) => {
                    const selectedTeach = teachers.find(t => t.id === e.target.value);
                    setNewGroup(prev => ({ 
                      ...prev, 
                      teacherId: e.target.value,
                      teacherShare: selectedTeach ? selectedTeach.defaultShare : 70
                    }));
                  }}
                  required
                  className="w-full bg-slate-50/50 hover:bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl px-3 py-2 text-xs transition-all outline-none"
                >
                  <option value="">{t.selectTeacher}</option>
                  {teachers.map(teach => (
                    <option key={teach.id} value={teach.id}>{teach.name} ({teach.subject})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">{t.studentName} / المجموعة</label>
                <input 
                  type="text"
                  value={newGroup.name}
                  onChange={(e) => setNewGroup(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Grade 12: Group A Sunday"
                  required
                  className="w-full bg-slate-50/50 hover:bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl px-3 py-2 text-xs transition-all outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">{t.schedule}</label>
                <input 
                  type="text"
                  value={newGroup.schedule}
                  onChange={(e) => setNewGroup(prev => ({ ...prev, schedule: e.target.value }))}
                  required
                  className="w-full bg-slate-50/50 hover:bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl px-3 py-2 text-xs transition-all outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">{t.pricePerSession}</label>
                <input 
                  type="number"
                  value={newGroup.pricePerSession}
                  onChange={(e) => setNewGroup(prev => ({ ...prev, pricePerSession: Number(e.target.value) }))}
                  min={0}
                  className="w-full bg-slate-50/50 hover:bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl px-3 py-2 text-xs transition-all outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">{t.bookletPrice}</label>
                <input 
                  type="number"
                  value={newGroup.bookletPrice}
                  onChange={(e) => setNewGroup(prev => ({ ...prev, bookletPrice: Number(e.target.value) }))}
                  min={0}
                  className="w-full bg-slate-50/50 hover:bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl px-3 py-2 text-xs transition-all outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">Cost</label>
                  <input 
                    type="number"
                    value={newGroup.bookletCost}
                    onChange={(e) => setNewGroup(prev => ({ ...prev, bookletCost: Number(e.target.value) }))}
                    min={0}
                    className="w-full bg-slate-50/50 hover:bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-lg px-2 py-2 text-xs transition-all outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">Stock</label>
                  <input 
                    type="number"
                    value={newGroup.bookletStock}
                    onChange={(e) => setNewGroup(prev => ({ ...prev, bookletStock: Number(e.target.value) }))}
                    min={0}
                    className="w-full bg-slate-50/50 hover:bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-lg px-2 py-2 text-xs transition-all outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">{t.teacherShare} (%)</label>
                <input 
                  type="number"
                  value={newGroup.teacherShare}
                  onChange={(e) => setNewGroup(prev => ({ ...prev, teacherShare: Number(e.target.value) }))}
                  min={0}
                  max={100}
                  className="w-full bg-slate-50/50 hover:bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl px-3 py-2 text-xs transition-all outline-none"
                />
              </div>

              <div className="md:col-span-2 flex items-end">
                <button 
                  type="submit" 
                  className="w-full bg-slate-900 hover:bg-slate-850 active:scale-[0.98] text-white rounded-xl py-2 text-xs font-bold shadow-xs flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>{t.createGroup}</span>
                </button>
              </div>
            </form>

            {/* List existing groups */}
            <div className="overflow-x-auto rounded-xl border border-slate-200/60">
              <table className="w-full text-left rtl:text-right text-xs text-slate-500">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-slate-200/80 text-slate-600 font-bold">
                    <th className="py-2.5 px-4">{t.groupedBy}</th>
                    <th className="py-2.5 px-3">{t.schedule}</th>
                    <th className="py-2.5 px-3 text-center">{t.pricePerSession}</th>
                    <th className="py-2.5 px-3 text-center">{t.bookletPrice}</th>
                    <th className="py-2.5 px-3 text-center">{t.bookletStock}</th>
                    <th className="py-2.5 px-3 text-center">{t.teacherShare}%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {groups.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-400 font-medium">{t.noData}</td>
                    </tr>
                  ) : (
                    groups.map((grp) => {
                      const teach = teachers.find(t => t.id === grp.teacherId);
                      return (
                        <tr key={grp.id} className="hover:bg-slate-50/40 text-slate-700 font-medium transition-colors">
                          <td className="py-3 px-4">
                            <span className="text-slate-900 font-bold block">{grp.name}</span>
                            <span className="text-slate-400 text-[9px] block font-bold uppercase">{teach ? teach.name : '—'}</span>
                          </td>
                          <td className="py-3 px-3 text-[10px]">{grp.schedule}</td>
                          <td className="py-3 px-3 text-center font-bold text-slate-900 font-mono">{grp.pricePerSession} <span className="text-[9px] text-slate-400">EGP</span></td>
                          <td className="py-3 px-3 text-center text-slate-500 font-mono">{grp.bookletPrice} <span className="text-[9px] text-slate-300">EGP</span></td>
                          <td className={`py-3 px-3 text-center font-bold font-mono ${grp.bookletStock < 10 ? 'text-red-500' : 'text-slate-600'}`}>
                            {grp.bookletStock}
                          </td>
                          <td className="py-3 px-3 text-center text-emerald-600 font-bold font-mono">{grp.teacherShare}%</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

          </div>

          {/* DYNAMIC GENERAL EXPENSES SECTION */}
          <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-xs space-y-5">
            <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center space-x-2 rtl:space-x-reverse border-b border-slate-100 pb-3">
              <TrendingUp className="w-4 h-4 text-rose-500" />
              <span>{t.expensesLedger}</span>
            </h3>

            <form onSubmit={handleAddExpense} className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">{t.expenseCategory}</label>
                <select 
                  value={newExpense.category}
                  onChange={(e) => setNewExpense(prev => ({ ...prev, category: e.target.value as any }))}
                  className="w-full bg-slate-50/50 hover:bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl px-3 py-2 text-xs transition-all outline-none"
                >
                  <option value="Rent">Rent / إيجار السنتر</option>
                  <option value="Utilities">Utilities / كهرباء ومياه</option>
                  <option value="Salaries">Salaries / مرتبات المساعدين</option>
                  <option value="Printing">Printing / ورق وطباعة ملازم</option>
                  <option value="Marketing">Marketing / دعاية وإعلان</option>
                  <option value="Other">Other / شاي وضيافة ومصروفات أخرى</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">{t.expenseAmount}</label>
                <input 
                  type="number"
                  value={newExpense.amount || ''}
                  onChange={(e) => setNewExpense(prev => ({ ...prev, amount: Number(e.target.value) }))}
                  placeholder="500"
                  required
                  min={1}
                  className="w-full bg-slate-50/50 hover:bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl px-3 py-2 text-xs transition-all outline-none"
                />
              </div>

              <div className="md:col-span-2 flex items-end space-x-2 rtl:space-x-reverse">
                <div className="flex-1">
                  <label className="block text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">{t.expenseDescription}</label>
                  <input 
                    type="text"
                    value={newExpense.description}
                    onChange={(e) => setNewExpense(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="E.g., Bought 5 reams of paper"
                    required
                    className="w-full bg-slate-50/50 hover:bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl px-3 py-2 text-xs transition-all outline-none"
                  />
                </div>
                <button 
                  type="submit" 
                  className="bg-rose-500 hover:bg-rose-600 active:scale-[0.98] text-white rounded-xl px-4 py-2 text-xs font-bold shadow-xs flex items-center justify-center transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </form>

            {/* List Expenses */}
            <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200/60 font-sans">
              <table className="w-full text-left rtl:text-right text-xs text-slate-500">
                <thead className="bg-slate-50 sticky top-0 border-b border-slate-200/80 font-bold text-slate-600">
                  <tr>
                    <th className="py-2.5 px-3">{t.expenseCategory}</th>
                    <th className="py-2.5 px-2">{t.expenseDescription}</th>
                    <th className="py-2.5 px-3 text-right rtl:text-left">{t.expenseAmount}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {expenses.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-4 text-center text-slate-400 font-medium">{t.noData}</td>
                    </tr>
                  ) : (
                    expenses.map((expense) => (
                      <tr key={expense.id} className="hover:bg-slate-50/40 text-slate-700 font-medium">
                        <td className="py-2.5 px-3 font-semibold text-[11px] text-rose-850">{expense.category}</td>
                        <td className="py-2.5 px-2 text-slate-500 text-[10px]">{expense.description}</td>
                        <td className="py-2.5 px-3 text-right rtl:text-left font-bold text-slate-900 font-mono">
                          {expense.amount} {config.currency}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

          </div>

        </div>

        {/* RIGHT COLUMN: WHATSAPP CONFIG & BRANDING */}
        <div className="space-y-6">
          
          {/* SINGLETON SYSTEM CONFIG */}
          <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-xs space-y-5">
            <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center space-x-2 rtl:space-x-reverse border-b border-slate-100 pb-3">
              <Settings className="w-4 h-4 text-indigo-600" />
              <span>Center Customization</span>
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">Center Brand Name</label>
                <input 
                  type="text"
                  value={config.name}
                  onChange={(e) => setConfig(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full bg-slate-50/50 hover:bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl px-3 py-2 text-xs transition-all outline-none"
                  placeholder="El-Safwa Center (سنتر الصفوة)"
                />
              </div>

              <div>
                <label className="block text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">Functional Currency Symbol</label>
                <input 
                  type="text"
                  value={config.currency}
                  onChange={(e) => setConfig(prev => ({ ...prev, currency: e.target.value }))}
                  className="w-full bg-slate-50/50 hover:bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl px-3 py-2 text-xs transition-all outline-none"
                  placeholder="L.E or EGP"
                />
              </div>
            </div>
          </div>

          {/* TELEMETRY GATEWAY - WHATSAPP */}
          <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-xs space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center space-x-2 rtl:space-x-reverse">
                <Smartphone className="w-4 h-4 text-emerald-600" />
                <span>{t.whatsappSettings}</span>
              </h3>
              <input 
                type="checkbox"
                checked={config.whatsappEnabled}
                onChange={(e) => setConfig(prev => ({ ...prev, whatsappEnabled: e.target.checked }))}
                className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
              />
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-4 text-xs">
              {config.whatsappEnabled && (
                <div>
                  <label className="block text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-2">
                    {isRtl ? 'طريقة تفعيل الإرسال عبر الواتساب' : 'WhatsApp Delivery Mode'}
                  </label>
                  <div className="grid grid-cols-2 gap-2 bg-slate-50 p-1 rounded-xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setConfig(prev => ({ ...prev, whatsappMode: 'free_wa_link' }))}
                      className={`py-1.5 px-2 rounded-lg text-center font-bold transition-all text-[11px] cursor-pointer ${
                        (!config.whatsappMode || config.whatsappMode === 'free_wa_link')
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                      }`}
                    >
                      {isRtl ? '🆓 مجاني وسهل (wa.me)' : '🆓 Free & Easy'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfig(prev => ({ ...prev, whatsappMode: 'api_gateway' }))}
                      className={`py-1.5 px-2 rounded-lg text-center font-bold transition-all text-[11px] cursor-pointer ${
                        config.whatsappMode === 'api_gateway'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                      }`}
                    >
                      {isRtl ? '🤖 تلقائي (UltraMsg API)' : '🤖 Paid API Gateway'}
                    </button>
                  </div>
                </div>
              )}

              {config.whatsappEnabled && (!config.whatsappMode || config.whatsappMode === 'free_wa_link') && (
                <div className="p-3.5 bg-emerald-50/55 border border-emerald-100 rounded-xl space-y-2">
                  <p className="font-bold text-emerald-850 text-[11px] flex items-center gap-1.5 rtl:flex-row-reverse">
                    <span>🟢</span>
                    <span>{isRtl ? 'الطريقة المجانية والسهلة بنسبة 100%:' : '100% Free & Easy Mode:'}</span>
                  </p>
                  <p className="text-slate-600 text-[10px] leading-relaxed">
                    {isRtl 
                      ? 'لا حاجة لدفع أي رسوم أو عمل حسابات معقدة! عند مسح الحضور للطالب أو تسجيله، سيظهر لك "زر إرسال أخضر" في الشاشة يمكنك نقره لفتح واتساب ويب وإرسال الرسالة الجاهزة فوردًا وبالمجان وبأمان تام.' 
                      : 'No fees, subscriptions, or complicated backend code! When a student logs attendance, you simply click the glowing green button to open WhatsApp and send the prefilled, ready-to-dispatch template directly for free.'}
                  </p>
                </div>
              )}

              {config.whatsappEnabled && config.whatsappMode === 'api_gateway' && (
                <div className="space-y-4">
                  <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
                    <p className="text-indigo-850 font-bold text-[10px] mb-1">
                      {isRtl ? '⚠️ ملحوظة الاشتراك التلقائي:' : '⚠️ Subscription Gateway Note:'}
                    </p>
                    <p className="text-slate-600 text-[9px] leading-normal">
                      {isRtl
                        ? 'هذه الطريقة تتطلب أن تملك حساب اشتراك مدفوع على موقع UltraMsg لتلقي وإرسال الرسائل تلقائياً في الخلفية تماماً.'
                        : 'This mode silently fires notifications to the parents in the background. It requires an active, paid account subscription on UltraMsg.'}
                    </p>
                  </div>

                  <div>
                    <label className="block text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">{t.apiUrl}</label>
                    <input 
                      type="text"
                      value={config.whatsappApiUrl}
                      onChange={(e) => setConfig(prev => ({ ...prev, whatsappApiUrl: e.target.value }))}
                      disabled={!config.whatsappEnabled}
                      className="w-full bg-slate-50/50 hover:bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl px-3 py-2 text-xs transition-all outline-none disabled:opacity-50"
                      placeholder="https://api.ultramsg.com/v1/messages/chat"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">{t.apiToken}</label>
                    <input 
                      type="password"
                      value={config.whatsappToken}
                      onChange={(e) => setConfig(prev => ({ ...prev, whatsappToken: e.target.value }))}
                      disabled={!config.whatsappEnabled}
                      className="w-full bg-slate-50/50 hover:bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl px-3 py-2 text-xs transition-all outline-none disabled:opacity-50"
                      placeholder="Enter API token key"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">{t.instanceId}</label>
                    <input 
                      type="text"
                      value={config.whatsappInstanceId}
                      onChange={(e) => setConfig(prev => ({ ...prev, whatsappInstanceId: e.target.value }))}
                      disabled={!config.whatsappEnabled}
                      className="w-full bg-slate-50/50 hover:bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl px-3 py-2 text-xs transition-all outline-none disabled:opacity-50"
                      placeholder="instance91244"
                    />
                  </div>
                </div>
              )}

              <div className="border-t border-slate-100 pt-4 space-y-3">
                <p className="font-extrabold text-slate-900 uppercase tracking-widest text-[9px] mb-2">{isRtl ? 'قوالب الرسائل الجاهزة' : 'Dynamic Messages Templates'}</p>
                
                <div>
                  <label className="block text-slate-400 font-bold text-[9px] mb-1">{isRtl ? 'نص ترحيب الاشتراك' : 'Welcome Text'}</label>
                  <textarea 
                    rows={2}
                    value={config.welcomeTemplate}
                    onChange={(e) => setConfig(prev => ({ ...prev, welcomeTemplate: e.target.value }))}
                    disabled={!config.whatsappEnabled}
                    className="w-full bg-slate-50/50 hover:bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl p-2 text-[10px] focus:outline-none disabled:opacity-50 font-sans"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-bold text-[9px] mb-1">{isRtl ? 'نص إثبات الحضور والوصول' : 'Arrival Scan Msg'}</label>
                  <textarea 
                    rows={2}
                    value={config.attendanceTemplate}
                    onChange={(e) => setConfig(prev => ({ ...prev, attendanceTemplate: e.target.value }))}
                    disabled={!config.whatsappEnabled}
                    className="w-full bg-slate-50/50 hover:bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl p-2 text-[10px] focus:outline-none disabled:opacity-50 font-sans"
                  />
                </div>
              </div>

              <button 
                type="submit" 
                className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-xl py-2.5 font-bold shadow-xs transition-all mt-2 cursor-pointer text-xs"
              >
                {t.saveSettings}
              </button>
            </form>
          </div>

        </div>

      </div>

    </div>
  );
}
