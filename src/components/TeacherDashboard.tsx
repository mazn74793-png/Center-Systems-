/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Teacher, ClassGroup, Student, FinancialSession, TranslationKeys } from '../types';
import { Award, BookOpen, Layers, BarChart3, Users, DollarSign, Calendar } from 'lucide-react';
import { motion } from 'motion/react';

interface TeacherDashboardProps {
  t: TranslationKeys;
  isRtl: boolean;
}

export default function TeacherDashboard({ t, isRtl }: TeacherDashboardProps) {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [groups, setGroups] = useState<ClassGroup[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [financials, setFinancials] = useState<FinancialSession[]>([]);
  const [allStudentsInSystem, setAllStudentsInSystem] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);

  // Load initial teachers
  useEffect(() => {
    const fetchInit = async () => {
      try {
        setLoading(true);
        const teachersSnap = await getDocs(collection(db, 'teachers'));
        const teachersList: Teacher[] = [];
        teachersSnap.forEach(doc => {
          teachersList.push({ id: doc.id, ...doc.data() } as Teacher);
        });
        setTeachers(teachersList);
        if (teachersList.length > 0) {
          setSelectedTeacherId(teachersList[0].id);
        }

        // Fetch all students to match roster
        const studSnap = await getDocs(collection(db, 'students'));
        const studList: Student[] = [];
        studSnap.forEach(doc => {
          studList.push({ id: doc.id, ...doc.data() } as Student);
        });
        setAllStudentsInSystem(studList);
      } catch (err) {
        console.error("Error loading teachers", err);
      } finally {
        setLoading(false);
      }
    };
    fetchInit();
  }, []);

  // Fetch teacher-specific information when selected ID changes
  useEffect(() => {
    if (!selectedTeacherId) return;
    fetchTeacherData();
  }, [selectedTeacherId]);

  const fetchTeacherData = async () => {
    try {
      setLoading(true);
      // Fetch teacher groups
      const groupsQuery = query(
        collection(db, 'classes_groups'), 
        where('teacherId', '==', selectedTeacherId)
      );
      const groupsSnap = await getDocs(groupsQuery);
      const groupsList: ClassGroup[] = [];
      const groupIds: string[] = [];
      groupsSnap.forEach(doc => {
        groupIds.push(doc.id);
        groupsList.push({ id: doc.id, ...doc.data() } as ClassGroup);
      });
      setGroups(groupsList);

      // Financial Sessions matching groups
      if (groupIds.length > 0) {
        // Query financial sessions for these groups
        const financialQuery = query(
          collection(db, 'financial_sessions'),
          where('groupId', 'in', groupIds)
        );
        const finsSnap = await getDocs(financialQuery);
        const finsList: FinancialSession[] = [];
        finsSnap.forEach(doc => {
          finsList.push({ id: doc.id, ...doc.data() } as FinancialSession);
        });
        setFinancials(finsList);
      } else {
        setFinancials([]);
      }

    } catch (err) {
      console.error("Error loading teacher details", err);
    } finally {
      setLoading(false);
    }
  };

  // Calculations
  const activeTeacher = teachers.find(t => t.id === selectedTeacherId);
  
  // Total stats for the active teacher across all their groups
  const totalTeacherEarnings = financials.reduce((acc, current) => acc + (current.teacherEarnings || 0), 0);
  const totalSessionsConducted = financials.length;
  const totalStudentsTaught = financials.reduce((acc, current) => acc + (current.totalAttendance || 0), 0);

  return (
    <div className="space-y-6 animate-fade-in text-slate-950 font-sans">
      
      {/* Simulation Selector Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">{t.selectRole}</span>
          <span className="text-xs font-bold text-slate-600">Currently viewing as Custom Teacher Ledger</span>
        </div>
        <select
          value={selectedTeacherId}
          onChange={(e) => setSelectedTeacherId(e.target.value)}
          className="bg-slate-50/50 border border-slate-200 text-slate-700 px-4 py-2 rounded-xl text-xs focus:outline-none focus:ring-4 focus:ring-indigo-100 font-semibold cursor-pointer transition-all"
        >
          {teachers.map(teach => (
            <option key={teach.id} value={teach.id}>{teach.name} ({teach.subject})</option>
          ))}
        </select>
      </div>

      {activeTeacher ? (
        <>
          {/* STATS HEADER */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            <motion.div 
              whileHover={{ y: -2 }}
              className="bg-white p-5 rounded-xl border border-slate-200/85 shadow-xs flex items-center space-x-4 rtl:space-x-reverse"
            >
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Instructor Name</p>
                <p className="text-base font-extrabold text-slate-900 mt-0.5">{activeTeacher.name}</p>
                <p className="text-[10px] text-slate-400 font-semibold tracking-wide uppercase">{activeTeacher.subject}</p>
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
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t.teacherEarnings}</p>
                <p className="text-2xl font-extrabold text-emerald-600 mt-0.5 font-mono">{totalTeacherEarnings} <span className="text-xs text-slate-400 font-medium">EGP</span></p>
                <p className="text-[9px] text-slate-400 font-semibold tracking-wide uppercase">Accumulated from {totalSessionsConducted} sessions</p>
              </div>
            </motion.div>

            <motion.div 
              whileHover={{ y: -2 }}
              className="bg-white p-5 rounded-xl border border-slate-200/85 shadow-xs flex items-center space-x-4 rtl:space-x-reverse"
            >
              <div className="p-3 bg-purple-50 text-purple-600 rounded-lg">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Scanned Attendees</p>
                <p className="text-2xl font-extrabold text-purple-700 mt-0.5 font-mono">{totalStudentsTaught}</p>
                <p className="text-[9px] text-slate-400 font-semibold tracking-wide uppercase">Taught across active groups</p>
              </div>
            </motion.div>

          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* GROUPS LIST */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-xs space-y-4">
                <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center space-x-2 rtl:space-x-reverse border-b border-slate-100 pb-3">
                  <Layers className="w-4 h-4 text-indigo-500" />
                  <span>My Active Groups ({groups.length})</span>
                </h3>

                <div className="space-y-3">
                  {groups.length === 0 ? (
                    <p className="text-xs text-center text-slate-400 py-6 font-medium">{t.noData}</p>
                  ) : (
                    groups.map(grp => (
                      <div key={grp.id} className="p-4 bg-slate-50/50 hover:bg-slate-50/20 rounded-xl border border-slate-200/60 transition-colors text-xs font-medium">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-bold text-slate-900">{grp.name}</span>
                          <span className="bg-indigo-50 text-indigo-700 text-[9px] px-2 py-0.5 rounded-md font-extrabold font-mono">
                            {grp.pricePerSession} EGP
                          </span>
                        </div>
                        <p className="text-slate-400 text-[10px] flex items-center space-x-1 mt-1.5 rtl:space-x-reverse">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>{grp.schedule}</span>
                        </p>
                        <div className="flex justify-between border-t border-slate-150 mt-3 pt-2 text-[10px] text-slate-400">
                          <span>Split: <strong className="text-indigo-600 font-bold font-mono">{grp.teacherShare}%</strong></span>
                          <span>Material: <strong className="text-slate-600 font-bold font-mono">{grp.bookletPrice} EGP</strong></span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* FINANCIAL REVENUE MATRIX */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-xs space-y-4">
                <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center space-x-2 rlt:space-x-reverse border-b border-slate-100 pb-3">
                  <BarChart3 className="w-4 h-4 text-indigo-500" />
                  <span>Financial Ledgers & Shares</span>
                </h3>

                <div className="overflow-x-auto rounded-xl border border-slate-200/60">
                  <table className="w-full text-left rtl:text-right text-xs text-slate-500">
                    <thead>
                      <tr className="bg-slate-50/75 border-b border-slate-200/80 text-slate-600 font-bold">
                        <th className="py-2.5 px-4">Group</th>
                        <th className="py-2.5 px-3 text-center">Attendance</th>
                        <th className="py-2.5 px-3 text-center">Revenue</th>
                        <th className="py-2.5 px-3 text-center">Booklets Sold</th>
                        <th className="py-2.5 px-3 text-center font-bold text-emerald-600">My Share</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {financials.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-slate-400 font-medium">{t.noData}</td>
                        </tr>
                      ) : (
                        financials.map(fin => {
                          const grp = groups.find(g => g.id === fin.groupId);
                          return (
                            <tr key={fin.id} className="hover:bg-slate-50/40 text-slate-700 font-medium transition-colors">
                              <td className="py-3 px-4">
                                <span className="text-slate-900 block font-bold">{grp ? grp.name : '—'}</span>
                                <span className="text-[9px] text-slate-400 block font-mono font-bold uppercase mt-0.5">
                                  {new Date(fin.sessionDate.toDate ? fin.sessionDate.toDate() : fin.sessionDate).toLocaleDateString()}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-center font-mono font-bold">{fin.totalAttendance}</td>
                              <td className="py-3 px-3 text-center text-slate-900 font-mono">{fin.totalSessionRevenue} EGP</td>
                              <td className="py-3 px-3 text-center font-mono">{fin.totalBookletsSold}</td>
                              <td className="py-3 px-3 text-center text-emerald-600 font-bold font-mono">
                                {fin.teacherEarnings} EGP
                              </td>
                              <td className="py-3 px-3 text-center">
                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md ${
                                  fin.isClosed 
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200/55' 
                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200/55'
                                }`}>
                                  {fin.isClosed ? t.closed : t.open}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

          </div>
        </>
      ) : (
        <div className="bg-white p-12 text-center rounded-xl border border-slate-200/90 shadow-xs">
          <p className="text-slate-400 font-medium text-xs">Please onboard a Teacher profile in the Super Admin Dashboard first!</p>
        </div>
      )}

    </div>
  );
}
