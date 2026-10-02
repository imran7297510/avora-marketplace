import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, getDocs, doc, setDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import { SupportTicket } from '../types';
import { Navigate } from 'react-router-dom';
import { CheckCircle, AlertTriangle, Send, History, Image as ImageIcon, X, Paperclip } from 'lucide-react';

export function Support() {
  const { user, loginWithGoogle, isBlocked } = useAuth();
  
  const [activeTab, setActiveTab] = useState<'submit' | 'history'>('submit');
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<string>('OTHERS');
  const [message, setMessage] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formSuccess, setFormSuccess] = useState(false);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user && !user.isAnonymous) {
      if (user.displayName) setName(user.displayName);
      fetchTickets();
    }
  }, [user]);

  const fetchTickets = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, 'supportTickets'), 
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      setTickets(snap.docs.map(d => ({ ...d.data(), id: d.id } as SupportTicket)));
    } catch (e) {
      console.error(e);
      // Wait for indexes if needed
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.type)) {
      setFormError('Allowed files: JPG, PNG, PDF, DOC, DOCX.');
      return;
    }

    setIsUploading(true);
    setFormError('');

    try {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (file.type.startsWith('image/')) {
          const img = new Image();
          img.src = reader.result as string;
          img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            
            const MAX_DIM = 1200;
            if (width > MAX_DIM || height > MAX_DIM) {
              if (width > height) {
                height = (height / width) * MAX_DIM;
                width = MAX_DIM;
              } else {
                width = (width / height) * MAX_DIM;
                height = MAX_DIM;
              }
            }
            
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, width, height);
              const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
              setAttachmentUrl(compressedDataUrl);
            } else {
              setAttachmentUrl(reader.result as string);
            }
            setIsUploading(false);
          };
        } else {
          setAttachmentUrl(reader.result as string);
          setIsUploading(false);
        }
      };
      reader.onerror = () => {
        setFormError('Failed to read file.');
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error(error);
      setFormError('Error processing file.');
      setIsUploading(false);
    }
  };

  const removeAttachment = () => {
    setAttachmentUrl('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const proceedSubmit = async () => {
    setShowConfirm(false);
    setFormError('');
    setFormSuccess(false);
    
    if (!user || user.isAnonymous) {
      setFormError('You must be logged in to submit.');
      return;
    }

    if (!name || !subject || !message.trim()) {
      setFormError('Name, Subject, and Message are required.');
      return;
    }

    setSubmitting(true);
    try {
      const newRef = doc(collection(db, 'supportTickets'));
      await setDoc(newRef, {
        userId: user.uid,
        name: name,
        email: user.email || '',
        subject: subject,
        category: category,
        message: message.trim(),
        status: 'PENDING',
        attachmentUrl: attachmentUrl || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      try {
        const notifRef = doc(collection(db, 'notifications'));
        await setDoc(notifRef, {
           type: 'SYSTEM',
           userId: user.uid,
           title: 'Support Ticket Received',
           message: `We have received your ticket regarding ${category}.`,
           read: false,
           createdAt: serverTimestamp()
        });
      } catch (err) { console.error('Error with ticket notification', err); }

      setFormSuccess(true);
      setSubject('');
      setMessage('');
      setCategory('OTHERS');
      setAttachmentUrl('');
      // refresh tickets
      fetchTickets();
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'supportTickets');
      setFormError('An error occurred while submitting. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      setFormError('Message is required.');
      return;
    }
    setShowConfirm(true);
  };

  if (!user || user.isAnonymous) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10 md:py-20 flex-1 w-full text-center">
        <h1 className="text-2xl md:text-3xl font-extrabold text-stone-900 mb-4">Support & Suggestions</h1>
        <p className="text-stone-600 text-sm md:text-base mb-8">Please login to submit support tickets, complaints, or suggestions.</p>
        <button 
          onClick={loginWithGoogle}
          className="inline-flex items-center justify-center px-6 py-3 bg-stone-900 text-white font-bold rounded-lg hover:bg-stone-800 transition-colors"
        >
          Login with Google
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 md:py-8 lg:py-12 flex-1 w-full">
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl lg:text-4xl font-extrabold text-stone-900 mb-2">Support & Suggestions</h1>
        <p className="text-stone-600 text-sm md:text-base">We're here to help. Send us your queries, feedback, complaints, or suggestions.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden mb-8">
        <div className="flex border-b border-stone-200">
          <button 
            className={`flex-1 py-3 md:py-4 font-bold text-center border-b-2 transition-colors text-sm md:text-base ${activeTab === 'submit' ? 'border-amber-500 text-amber-600 bg-amber-50/50' : 'border-transparent text-stone-400 hover:text-stone-800 hover:bg-stone-50'}`}
            onClick={() => setActiveTab('submit')}
          >
            <div className="flex items-center justify-center gap-2"><Send className="w-4 h-4 md:w-5 md:h-5"/> Submit</div>
          </button>
          <button 
            className={`flex-1 py-3 md:py-4 font-bold text-center border-b-2 transition-colors text-sm md:text-base ${activeTab === 'history' ? 'border-amber-500 text-amber-600 bg-amber-50/50' : 'border-transparent text-stone-400 hover:text-stone-800 hover:bg-stone-50'}`}
            onClick={() => setActiveTab('history')}
          >
            <div className="flex items-center justify-center gap-2"><History className="w-4 h-4 md:w-5 md:h-5"/> History</div>
          </button>
        </div>

        <div className="p-4 md:p-8">
          {activeTab === 'submit' && (
            <div>
              {formSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-3 md:p-4 mb-4 md:mb-6 flex items-start gap-3 shadow-sm">
                  <CheckCircle className="w-5 h-5 md:w-6 md:h-6 text-emerald-500 shrink-0" />
                  <div>
                    <h4 className="font-bold text-sm md:text-base">Submitted successfully!</h4>
                    <p className="text-xs md:text-sm mt-0.5">Our support team will review it soon.</p>
                  </div>
                </div>
              )}

              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 md:p-4 mb-4 md:mb-6 flex items-start gap-3 shadow-sm text-sm">
                  <AlertTriangle className="w-5 h-5 md:w-6 md:h-6 text-red-500 shrink-0" />
                  <div className="font-medium">{formError}</div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                  <div>
                    <label className="block text-xs md:text-sm font-bold text-stone-700 mb-1">Full Name *</label>
                    <input 
                      type="text" 
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      className="w-full px-3 md:px-4 py-2 md:py-2.5 bg-stone-50 border border-stone-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs md:text-sm font-bold text-stone-700 mb-1">Email Address</label>
                    <input 
                      type="email" 
                      value={user.email || ''}
                      disabled
                      className="w-full px-3 md:px-4 py-2 md:py-2.5 bg-stone-100 border border-stone-200 rounded-md text-stone-400 cursor-not-allowed text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                  <div>
                    <label className="block text-xs md:text-sm font-bold text-stone-700 mb-1">Category *</label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {['SUGGESTIONS', 'COMPLAINTS', 'QUERIES', 'APPEALS', 'OTHERS'].map((cat) => (
                        <button
                           key={cat}
                           type="button"
                           onClick={() => setCategory(cat)}
                           className={`p-2 md:p-3 text-xs md:text-sm font-bold border rounded-lg transition-all ${category === cat ? 'bg-amber-100 border-amber-400 text-amber-900 shadow-sm' : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100 hover:border-stone-300'}`}
                        >
                          {cat.charAt(0) + cat.slice(1).toLowerCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4 md:mt-0">
                    <label className="block text-xs md:text-sm font-bold text-stone-700 mb-1">Subject / Title *</label>
                    <input 
                      type="text" 
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      required
                      className="w-full px-3 md:px-4 py-2 md:py-2.5 bg-stone-50 border border-stone-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all text-sm"
                      placeholder="Brief summary"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs md:text-sm font-bold text-stone-700 mb-1">Message *</label>
                  <textarea 
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    required
                    rows={8}
                    className="w-full px-3 md:px-4 py-2 md:py-3 bg-stone-50 border border-stone-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all resize-y text-sm"
                    placeholder="Provide as much detail as possible..."
                  ></textarea>
                </div>

                <div>
                  <label className="block text-xs md:text-sm font-bold text-stone-700 mb-1">Attach File (Optional, Max 2MB)</label>
                  
                  {!attachmentUrl ? (
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="cursor-pointer group flex flex-col items-center justify-center border-2 border-dashed border-stone-300 rounded-xl py-4 md:py-8 px-4 bg-stone-50 hover:bg-stone-100 hover:border-amber-400 transition-all font-sans"
                    >
                      <Paperclip className="w-6 h-6 md:w-10 md:h-10 text-stone-400 group-hover:text-amber-500 mb-2 transition-colors" />
                      <p className="text-stone-600 font-bold text-xs md:text-sm uppercase tracking-widest text-center">Upload JPG, PNG, PDF, DOC, DOCX</p>
                    </div>
                  ) : (
                    <div className="relative inline-block mt-2">
                       {attachmentUrl.startsWith('data:image/') ? (
                         <img 
                           src={attachmentUrl} 
                           alt="Preview" 
                           className="h-32 w-auto object-cover rounded-lg border border-stone-200 shadow-sm"
                         />
                       ) : (
                         <div className="h-24 w-24 bg-stone-100 border border-stone-200 rounded-lg flex items-center justify-center text-stone-400 flex-col uppercase text-xs tracking-widest font-bold">
                            <Paperclip className="w-8 h-8 mb-1" />
                            File
                         </div>
                       )}
                       <button
                         type="button"
                         onClick={removeAttachment}
                         className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full shadow-lg hover:bg-red-600 transition-colors"
                       >
                         <X className="w-4 h-4" />
                       </button>
                    </div>
                  )}

                  <input 
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/jpeg,image/png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden"
                  />
                </div>

                <div className="pt-2 flex">
                  <button 
                    type="submit" 
                    disabled={submitting || isUploading}
                    className={`w-full md:w-auto px-8 py-3 rounded-md font-bold text-white shadow-sm transition-all focus:ring-2 focus:ring-offset-2 focus:ring-stone-900 text-sm md:text-base ${submitting || isUploading ? 'bg-stone-500 cursor-not-allowed' : 'bg-stone-900 hover:bg-stone-800'}`}
                  >
                    {submitting ? 'Submitting...' : isUploading ? 'Uploading...' : 'Send'}
                  </button>
                </div>
              </form>
              
              {showConfirm && (
                <div className="fixed inset-0 z-50 flexitems-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm flex">
                   <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm m-auto overflow-hidden text-center p-6 md:p-8 animate-in fade-in zoom-in duration-200">
                     <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                     <h3 className="text-xl font-black text-stone-900 mb-2">Are you sure you want to submit this ticket?</h3>
                     <p className="text-stone-400 text-sm mb-6">Our support team will review it as soon as possible.</p>
                     
                     <div className="flex gap-3">
                       <button 
                         onClick={() => setShowConfirm(false)}
                         disabled={submitting}
                         className="flex-1 px-4 py-3 bg-stone-100 text-stone-700 font-bold rounded-xl hover:bg-stone-200 transition-colors disabled:opacity-50"
                       >
                         Cancel
                       </button>
                       <button 
                         onClick={proceedSubmit}
                         disabled={submitting}
                         className="flex-1 px-4 py-3 bg-stone-900 text-white font-bold rounded-xl hover:bg-stone-800 transition-colors flex items-center justify-center disabled:opacity-50"
                       >
                         {submitting ? 'Sending...' : 'Confirm'}
                       </button>
                     </div>
                   </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-4">
              {loading ? (
                <div className="py-12 text-center text-stone-400">Loading history...</div>
              ) : tickets.length === 0 ? (
                <div className="py-12 text-center text-stone-400">
                  <History className="w-12 h-12 mx-auto mb-4 text-stone-300" />
                  <p>You haven't submitted any support tickets yet.</p>
                </div>
              ) : (
                tickets.map(ticket => (
                  <div key={ticket.id} className="border border-stone-200 rounded-lg p-3 md:p-5 hover:bg-stone-50 transition-colors">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 md:gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold uppercase tracking-wider text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded-sm">{ticket.category}</span>
                          <h4 className="font-bold text-sm md:text-lg text-stone-900">{ticket.subject}</h4>
                        </div>
                        <p className="text-stone-400 text-xs md:text-sm mb-2 md:mb-3 uppercase tracking-tighter">Submitted {(() => {
                          const ca = ticket.createdAt;
                          if (!ca) return 'Recent';
                          if (typeof ca.toDate === 'function') return ca.toDate().toLocaleDateString();
                          if (ca.seconds) return new Date(ca.seconds * 1000).toLocaleDateString();
                          const d = new Date(ca);
                          return !isNaN(d.getTime()) ? d.toLocaleDateString() : 'Recent';
                        })()}</p>
                        <p className="text-stone-800 text-sm whitespace-pre-wrap leading-relaxed">{ticket.message}</p>
                        {ticket.attachmentUrl && (
                          <div className="mt-3 md:mt-4">
                            <p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-1.5">Attached Reference:</p>
                            <a href={ticket.attachmentUrl} target="_blank" rel="noopener noreferrer" className="block w-fit group">
                              <img 
                                src={ticket.attachmentUrl} 
                                alt="Attachment" 
                                className="h-20 md:h-24 w-auto rounded-lg border border-stone-200 shadow-sm hover:ring-2 hover:ring-amber-500 transition-all"
                              />
                              <span className="text-amber-600 hover:underline text-xs font-medium block mt-1">
                                View full size
                              </span>
                            </a>
                          </div>
                        )}
                        {ticket.adminReply && (
                          <div className="mt-4 p-4 bg-emerald-50 rounded-lg border border-emerald-100 italic">
                            <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-1.5">Official Response:</p>
                            <p className="text-stone-800 text-sm whitespace-pre-wrap leading-relaxed">"{ticket.adminReply}"</p>
                          </div>
                        )}
                      </div>
                      <div className="md:text-right shrink-0">
                         <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold shadow-sm ${
                           ticket.status === 'PENDING' ? 'bg-amber-100 text-amber-800' :
                           ticket.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800' :
                           'bg-emerald-100 text-emerald-800'
                         }`}>
                           {ticket.status.replace('_', ' ')}
                         </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
