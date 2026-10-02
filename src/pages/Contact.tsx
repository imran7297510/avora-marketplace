import { Mail, Phone } from 'lucide-react';

export function Contact() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 text-center">
      <h1 className="text-3xl font-bold text-stone-900 mb-4">Contact Us</h1>
      <p className="text-stone-400 mb-12">Need help with a listing or have a question? Reach out to us.</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-lg shadow-sm border border-stone-200 flex flex-col items-center justify-center">
          <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-4">
            <Mail className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-stone-900 mb-2">Email Support</h2>
          <a href="mailto:imran7297510@gmail.com" className="text-stone-600 hover:text-amber-600 font-medium">
            imran7297510@gmail.com
          </a>
        </div>

        <div className="bg-white p-8 rounded-lg shadow-sm border border-stone-200 flex flex-col items-center justify-center">
          <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-4">
            <Phone className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-stone-900 mb-2">Phone / WhatsApp</h2>
          <a href="https://wa.me/923467297510" target="_blank" rel="noopener noreferrer" className="text-stone-600 hover:text-amber-600 font-medium">
            +92 346 7297510
          </a>
        </div>

        <div className="bg-white p-8 rounded-lg shadow-sm border border-stone-200 flex flex-col items-center justify-center md:col-span-2">
          <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          </div>
          <h2 className="text-lg font-bold text-stone-900 mb-2">Address</h2>
          <p className="text-stone-600 font-medium max-w-md mx-auto">
            Ratta Khurd (Jhang Lalian Road) Tehsil and District Jhang
          </p>
        </div>
      </div>
    </div>
  );
}
