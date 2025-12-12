import React from 'react';
import { X, Shield } from 'lucide-react';

export default function PrivacyPolicyModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 md:p-8">
      <div className="bg-slate-900 w-full max-w-3xl max-h-[90vh] rounded-2xl border border-slate-700 shadow-2xl flex flex-col relative animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-6 border-b border-slate-800 bg-slate-950/50 rounded-t-2xl">
             <div className="flex items-center gap-3">
                 <Shield className="text-emerald-500" size={24} />
                 <div>
                    <h2 className="text-xl font-bold text-white">Privacy Policy</h2>
                    <p className="text-xs text-slate-500">Effective Date: January 1, 2025</p>
                 </div>
             </div>
             <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors">
                 <X size={24} />
             </button>
        </div>
        
        <div className="overflow-y-auto p-6 md:p-8 text-slate-300 space-y-6 text-sm leading-relaxed scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            
            <section>
                <h3 className="text-lg font-bold text-white mb-2">Introduction</h3>
                <p>GeoGraph Foundation ("we," "our," or "us") operates the GeoGraph Node application (the "App"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our App.</p>
                <p className="mt-2">Please read this Privacy Policy carefully. By using the App, you agree to the collection and use of information in accordance with this policy.</p>
            </section>

            <section>
                <h3 className="text-lg font-bold text-white mb-2">Information We Collect</h3>
                
                <h4 className="font-bold text-slate-200 mt-4 mb-1">Information You Provide Directly</h4>
                <ul className="list-disc pl-5 space-y-1 marker:text-emerald-500">
                    <li><strong>Account Information:</strong> When you create an account, we collect your email address and encrypted password.</li>
                    <li><strong>Contributed Content:</strong> Photos, scans, documents, and associated metadata you choose to upload and contribute to the GeoGraph Corpus.</li>
                    <li><strong>Wallet Information:</strong> If you connect a cryptocurrency wallet for NFT features, we store your public wallet address (never private keys).</li>
                </ul>

                <h4 className="font-bold text-slate-200 mt-4 mb-1">Information Collected Automatically</h4>
                <ul className="list-disc pl-5 space-y-1 marker:text-emerald-500">
                    <li><strong>Device Information:</strong> Device type, operating system, unique device identifiers, and mobile network information.</li>
                    <li><strong>Location Data:</strong> With your permission, we collect precise GPS coordinates when you capture or upload images. This is used to enrich metadata and enable GIS features.</li>
                    <li><strong>Camera Access:</strong> With your permission, we access your device camera to capture images for processing.</li>
                    <li><strong>Usage Data:</strong> Information about how you interact with the App, including features used, processing history, and session duration.</li>
                </ul>

                <h4 className="font-bold text-slate-200 mt-4 mb-1">Information from Third-Party Services</h4>
                <ul className="list-disc pl-5 space-y-1 marker:text-emerald-500">
                    <li><strong>Google Gemini API:</strong> Images you process are sent to Google's Gemini API for OCR and AI analysis. Google's privacy policy governs their handling of this data.</li>
                    <li><strong>Supabase:</strong> We use Supabase for authentication and data storage. Supabase's privacy policy applies to data stored on their servers.</li>
                </ul>
            </section>

            <section>
                <h3 className="text-lg font-bold text-white mb-2">How We Use Your Information</h3>
                <p>We use the information we collect to:</p>
                <ul className="list-disc pl-5 space-y-1 mt-2 marker:text-emerald-500">
                    <li>Provide, maintain, and improve the App's functionality</li>
                    <li>Process images using OCR and AI extraction</li>
                    <li>Generate metadata, knowledge graphs, and training data bundles</li>
                    <li>Enable contribution to the GeoGraph Corpus (with your explicit consent)</li>
                    <li>Authenticate your account and secure your data</li>
                    <li>Communicate with you about updates, features, and support</li>
                    <li>Comply with legal obligations</li>
                </ul>
            </section>

            <section>
                <h3 className="text-lg font-bold text-white mb-2">Data Contribution and Licensing</h3>
                
                <h4 className="font-bold text-slate-200 mt-4 mb-1">Voluntary Contributions</h4>
                <p>When you choose to contribute data to the GeoGraph Corpus:</p>
                <ul className="list-disc pl-5 space-y-1 mt-1 marker:text-emerald-500">
                    <li>Your contributed images and metadata are licensed under CC0 (public domain dedication)</li>
                    <li>Contributions are voluntary and require explicit action (pressing "Earn Shard" or similar)</li>
                    <li>Contributed data may be used for AI/ML training purposes</li>
                    <li>You retain the right to request removal of your contributions</li>
                </ul>

                <h4 className="font-bold text-slate-200 mt-4 mb-1">Local-First Architecture</h4>
                <ul className="list-disc pl-5 space-y-1 marker:text-emerald-500">
                    <li>All processing initially occurs on your device</li>
                    <li>Data is only uploaded to our servers when you explicitly contribute</li>
                    <li>You can use core features entirely offline</li>
                </ul>
            </section>

            <section>
                <h3 className="text-lg font-bold text-white mb-2">Data Sharing and Disclosure</h3>
                <p>We may share your information in the following circumstances:</p>
                
                <h4 className="font-bold text-slate-200 mt-4 mb-1">With Your Consent</h4>
                <ul className="list-disc pl-5 space-y-1 marker:text-emerald-500">
                    <li>When you contribute to the public GeoGraph Corpus</li>
                    <li>When you connect third-party services</li>
                </ul>

                <h4 className="font-bold text-slate-200 mt-4 mb-1">Service Providers</h4>
                <ul className="list-disc pl-5 space-y-1 marker:text-emerald-500">
                    <li><strong>Google Cloud/Gemini:</strong> For AI processing</li>
                    <li><strong>Supabase:</strong> For authentication and database services</li>
                    <li><strong>Vercel:</strong> For application hosting</li>
                </ul>

                <h4 className="font-bold text-slate-200 mt-4 mb-1">Legal Requirements</h4>
                <p>We may disclose information if required by law, subpoena, or government request.</p>

                <h4 className="font-bold text-slate-200 mt-4 mb-1">Business Transfers</h4>
                <p>In the event of a merger, acquisition, or sale of assets, user data may be transferred.</p>
            </section>

            <section>
                <h3 className="text-lg font-bold text-white mb-2">Data Security</h3>
                <p>We implement appropriate technical and organizational measures to protect your data:</p>
                <ul className="list-disc pl-5 space-y-1 mt-2 marker:text-emerald-500">
                    <li>Encryption in transit (HTTPS/TLS)</li>
                    <li>Encrypted password storage</li>
                    <li>Secure API key management</li>
                    <li>Regular security assessments</li>
                </ul>
                <p className="mt-2 text-slate-400">However, no method of electronic transmission or storage is 100% secure.</p>
            </section>

            <section>
                <h3 className="text-lg font-bold text-white mb-2">Data Retention</h3>
                <ul className="list-disc pl-5 space-y-1 marker:text-emerald-500">
                    <li><strong>Account Data:</strong> Retained until you delete your account</li>
                    <li><strong>Processing History:</strong> Stored locally on your device; you control deletion</li>
                    <li><strong>Contributed Data:</strong> Retained indefinitely in the public corpus unless removal is requested</li>
                    <li><strong>Analytics Data:</strong> Aggregated data retained for up to 2 years</li>
                </ul>
            </section>

            <section>
                <h3 className="text-lg font-bold text-white mb-2">Your Rights and Choices</h3>
                <ul className="list-disc pl-5 space-y-2 marker:text-emerald-500">
                    <li><strong>Access and Portability:</strong> You can export your data in JSON format from the App.</li>
                    <li><strong>Deletion:</strong> Delete local data through App settings, request account deletion, or request removal of contributed data.</li>
                    <li><strong>Location and Camera Permissions:</strong> You can revoke permissions at any time through your device settings.</li>
                    <li><strong>Opt-Out:</strong> You can use the App without contributing to the public corpus.</li>
                </ul>
            </section>

            <section>
                <h3 className="text-lg font-bold text-white mb-2">Children's Privacy</h3>
                <p>The App is not intended for children under 13. We do not knowingly collect information from children under 13.</p>
            </section>

            <section>
                <h3 className="text-lg font-bold text-white mb-2">International Data Transfers</h3>
                <p>Your information may be transferred to and processed in countries other than your own, including the United States.</p>
            </section>
            
            <section>
                <h3 className="text-lg font-bold text-white mb-2">Contact Us</h3>
                <p>If you have questions about this Privacy Policy or our data practices, please contact us:</p>
                <div className="mt-2 p-4 bg-slate-950 rounded-lg border border-slate-800">
                    <p className="font-bold text-white">GeoGraph Foundation</p>
                    <p className="font-mono text-emerald-400">Email: privacy@geograph.foundation</p>
                    <p className="font-mono text-emerald-400">Website: https://geograph.foundation/privacy</p>
                    <p className="font-mono text-slate-500 mt-2">Data Protection Officer: dpo@geograph.foundation</p>
                </div>
            </section>

            <div className="pt-4 border-t border-slate-800 text-xs text-slate-500">
                <p>California Privacy Rights (CCPA): Right to know, delete, opt-out, non-discrimination. We do not sell personal information.</p>
                <p className="mt-1">European Privacy Rights (GDPR): Right of access, rectification, erasure, restrict processing, portability, object.</p>
            </div>
        </div>
      </div>
    </div>
  );
}