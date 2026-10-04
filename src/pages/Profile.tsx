import React, { useEffect, useState, useRef } from "react";
import { ProfileVerificationTick } from "../components/ProfileVerificationTick";
import { CreditBalanceBadge } from "../features/credits";
import { cn } from "../lib/utils";
import { motion, AnimatePresence } from "motion/react";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  addDoc,
  limit,
  arrayUnion,
  deleteField,
  writeBatch
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { UserProfile, Listing } from "../types";
import { IS_READONLY_INSPECTION_MODE } from "../config/inspectionMode";
import { AuctionItem } from "../features/battle-bids/types";
import { KycImageLightbox } from "../components/KycImageLightbox";
import { checkUsernameUnique } from "../utils/username";
import { AuthModal } from "../components/AuthModal";
import { AccountSecurityCard } from "../components/AccountSecurityCard";
import { primeUserProfileCache } from "../services/userProfileCache";
import {
  Camera,
  CheckCircle,
  Upload,
  LayoutDashboard,
  ShieldCheck,
  User as UserIcon,
  Share2,
  Users,
  Gift,
  Copy,
  Globe,
  Shield,
  Crown,
  Clock,
  Zap,
  Package,
  Store,
  Building2,
  X,
  Menu,
  Fingerprint,
  FileText,
  Smartphone,
  ShieldAlert,
  Edit3,
  Lock,
  UserCheck,
  RefreshCw,
  AlertTriangle,
  FileCheck,
  XCircle,
  Rocket,
  ArrowRight,
  ShieldX,
  BadgeCheck,
  Hash,
  ExternalLink,
  Loader2,
  ZoomIn,
  Eye,
  Compass,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { KycApplication, NameChangeRequest } from "../types";
import { isSellerPremiumActive } from "../lib/premium";
import { COUNTRIES } from "../constants";
import { CountrySelector, getCountryFlag } from "../components/CountrySelector";
import { PhoneInput } from "../components/PhoneInput";
import { TrustScoreBadge } from "../components/SharedBadge";
import { getUserTrustEvents } from "../features/trust-score/trustScoreService";
import { TrustScoreEvent } from "../features/trust-score/types";
import { AccountBannedBanner } from "../components/AccountBannedBanner";

type ProfileTab = "profile" | "settings" | "kyc" | "trust";

// Secure watermarking helper for uploaded CNIC & Selfie images (no size restriction error; auto-scales and compresses)
const processImageWithWatermark = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(event.target?.result as string);
          return;
        }

        // Scale down high-resolution image to prevent massive document weight
        const maxDim = 1200;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        // Watermark styling
        ctx.save();
        ctx.translate(width / 2, height / 2);
        ctx.rotate(-Math.PI / 6); // slanted diagonal

        const fontSize = Math.max(14, Math.round(width / 14));
        ctx.font = `bold ${fontSize}px Inter, sans-serif`;
        ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // Add dropshadow contrast stroke
        ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
        ctx.lineWidth = fontSize / 8;
        ctx.strokeText("Uploaded to Avora", 0, 0);
        ctx.fillText("Uploaded to Avora", 0, 0);

        // Subtext
        ctx.font = `bold ${fontSize / 2}px Inter, sans-serif`;
        ctx.strokeText("Verified KYC Documents Only", 0, fontSize * 0.8);
        ctx.fillText("Verified KYC Documents Only", 0, fontSize * 0.8);

        ctx.restore();

        const dataUrl = canvas.toDataURL("image/jpeg", 0.80);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error("Failed to load image resource"));
      img.src = event.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read upload file"));
    reader.readAsDataURL(file);
  });
};

export function Profile() {
  const { 
    user, 
    userProfile,
    loginWithGoogle, 
    linkPasswordAccount, 
    linkGoogleAccount, 
    sendVerificationEmail, 
    authError, 
    isIframe, 
    loading: authLoading 
  } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<ProfileTab>("profile");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [imgError, setImgError] = useState(false);

  const handleTabChange = (tab: ProfileTab) => {
    setActiveTab(tab);
    setIsMenuOpen(false);
    navigate(`?tab=${tab}`, { replace: true });
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get("tab") as ProfileTab;
    if (tabParam && ["profile", "settings", "kyc", "trust"].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [location]);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [myListings, setMyListings] = useState<Listing[]>([]);
  const [myArenaAuctions, setMyArenaAuctions] = useState<AuctionItem[]>([]);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [lightboxImages, setLightboxImages] = useState<string[] | undefined>(undefined);
  const [lightboxTitle, setLightboxTitle] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applicationStatus, setApplicationStatus] = useState<'NONE' | 'PENDING' | 'REJECTED'>('NONE');
  const [isApplying, setIsApplying] = useState(false);
  const [proofUrl, setProofUrl] = useState("");
  const [txnId, setTxnId] = useState("");
  const [applyDuration, setApplyDuration] = useState("30");
  const [settingsSection, setSettingsSection] = useState<'INDIVIDUAL' | 'BUSINESS'>('INDIVIDUAL');
  const [formData, setFormData] = useState({
    name: "",
    realName: "",
    businessName: "",
    phoneNumber: "",
    country: "",
    countryOfStay: "",
    city: "",
    businessCity: "",
    address: "",
    photoURL: "",
    bio: "",
    websiteUrl: "",
    facebookPage: "",
    email: "",
    cnicNumber: "",
    residentialAddress: "",
    businessAddress: "",
    autoClearHistory: "off" as "off" | "30" | "90",
  });

  // Trust History Ledger States
  const [trustEvents, setTrustEvents] = useState<TrustScoreEvent[]>([]);
  const [trustEventsLoading, setTrustEventsLoading] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    let isMounted = true;
    const fetchTrustHistory = async () => {
      setTrustEventsLoading(true);
      try {
        const events = await getUserTrustEvents(user.uid, 50);
        if (isMounted) setTrustEvents(events);
      } catch (err) {
        console.error("Error fetching trust events:", err);
      } finally {
        if (isMounted) setTrustEventsLoading(false);
      }
    };
    fetchTrustHistory();
    return () => { isMounted = false; };
  }, [user?.uid, activeTab]);

  // KYC States
  const [kycApp, setKycApp] = useState<KycApplication | null>(null);
  const [pendingNameChange, setPendingNameChange] = useState<NameChangeRequest | null>(null);
  const [showProfileKycPopup, setShowProfileKycPopup] = useState(false);
  const [kycTrackingNumber, setKycTrackingNumber] = useState("");
  const [isEditingKyc, setIsEditingKyc] = useState(false);
  
  // KYC Form Fields
  const [kycCategory, setKycCategory] = useState<'INDIVIDUAL' | 'OWN_BUSINESS' | 'FIRM_COMPANY'>('INDIVIDUAL');
  const [kycLegalName, setKycLegalName] = useState("");
  const [kycBusinessName, setKycBusinessName] = useState("");
  const [kycBusinessType, setKycBusinessType] = useState("");
  const [kycCnicNumber, setKycCnicNumber] = useState("");
  const [kycFrontPhoto, setKycFrontPhoto] = useState("");
  const [kycBackPhoto, setKycBackPhoto] = useState("");
  const [kycSelfiePhoto, setKycSelfiePhoto] = useState("");
  const [kycBusinessDocPhoto, setKycBusinessDocPhoto] = useState("");
  const [kycMobileNumber, setKycMobileNumber] = useState("");
  const [kycBusinessPhone, setKycBusinessPhone] = useState("");
  const [kycCountry, setKycCountry] = useState("");
  const [kycCountryOfStay, setKycCountryOfStay] = useState("");
  const [kycCity, setKycCity] = useState("");
  const [kycResidentialAddress, setKycResidentialAddress] = useState("");
  const [kycBusinessAddress, setKycBusinessAddress] = useState("");
  const [kycDocumentType, setKycDocumentType] = useState<string>("NATIONAL_ID");
  const [kycCompanyName, setKycCompanyName] = useState("");
  const [kycRegistrationNumber, setKycRegistrationNumber] = useState("");
  const [kycRepDesignation, setKycRepDesignation] = useState("");
  const [kycRepAuthorityLetter, setKycRepAuthorityLetter] = useState("");
  const [kycTermsAccepted, setKycTermsAccepted] = useState(false);
  const [showKycTermsModal, setShowKycTermsModal] = useState(false);
  const [kycSubmitting, setKycSubmitting] = useState(false);
  const [kycError, setKycError] = useState("");
  const [watermarkingActive, setWatermarkingActive] = useState(false);

  // Identity Change request States
  const [nameChangeNewName, setNameChangeNewName] = useState("");
  const [nameChangeNewRealName, setNameChangeNewRealName] = useState("");
  const [nameChangeNewBusinessName, setNameChangeNewBusinessName] = useState("");
  const [nameChangeNewEmail, setNameChangeNewEmail] = useState("");
  const [nameChangeNewCnicNumber, setNameChangeNewCnicNumber] = useState("");
  const [nameChangeNewResidentialAddress, setNameChangeNewResidentialAddress] = useState("");
  const [nameChangeNewBusinessAddress, setNameChangeNewBusinessAddress] = useState("");
  const [nameChangeReason, setNameChangeReason] = useState("");
  const [nameChangeSubmitting, setNameChangeSubmitting] = useState(false);
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [newUsernameInput, setNewUsernameInput] = useState("");
  const [usernameChangeLoading, setUsernameChangeLoading] = useState(false);
  const [showNameChangeModal, setShowNameChangeModal] = useState(false);
  const [nameChangeMsg, setNameChangeMsg] = useState("");
  const [chatCount, setChatCount] = useState(0);

  // Explore My Listings States & Refs
  const [isExploreMyListings, setIsExploreMyListings] = useState(false);
  const [myListingsCategoryFilter, setMyListingsCategoryFilter] = useState<'ALL' | 'marketplace' | 'arena' | 'negotiation'>('ALL');
  const [myListingsSearchTerm, setMyListingsSearchTerm] = useState('');
  const profileListingsScrollRef = React.useRef<HTMLDivElement>(null);

  const handleProfileListingsScroll = (direction: 'left' | 'right') => {
    if (profileListingsScrollRef.current) {
      const amount = direction === 'left' ? -320 : 320;
      profileListingsScrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };
  
  // KYC Appeal Timer States
  const [appealTimeRemaining, setAppealTimeRemaining] = useState<string | null>(null);
  const [isAppealTimeExpired, setIsAppealTimeExpired] = useState(false);

  const isAppealRejected = Boolean(
    (kycApp as any)?.appealStatus === "REJECTED" || 
    (kycApp as any)?.appealRejectedAt ||
    (kycApp as any)?.appealRejectionReason
  );

  const isKycVerified = profile?.kycStatus === "APPROVED";
  const isKycLocked = profile?.kycStatus === "APPROVED" || profile?.kycStatus === "REVOKED";
  const isKycActiveApproved = profile?.kycStatus === "APPROVED";
  const isIndividual = profile?.kycType === "INDIVIDUAL" || kycApp?.category === "INDIVIDUAL";
  const isBusiness = !isIndividual && (
    profile?.kycType === "BUSINESS" || 
    profile?.kycType === "OWN_BUSINESS" || 
    profile?.kycType === "FIRM_COMPANY" || 
    kycApp?.category === "BUSINESS" ||
    kycApp?.category === "OWN_BUSINESS" ||
    kycApp?.category === "FIRM_COMPANY"
  );
  
  useEffect(() => {
    let intervalId: any;
    
    const calculateTimeRemaining = () => {
      if (!kycApp || kycApp.status !== "REVOKED" || isAppealRejected) {
        setAppealTimeRemaining(null);
        setIsAppealTimeExpired(isAppealRejected);
        return;
      }
      
      const parseTime = (val: any) => {
        if (!val) return null;
        if (typeof val.toDate === "function") return val.toDate();
        if (val.seconds) return new Date(val.seconds * 1000);
        const d = new Date(val);
        return !isNaN(d.getTime()) ? d : null;
      };
      
      const revokedTime = parseTime(kycApp.revokedAt);
      if (!revokedTime) {
        setAppealTimeRemaining(null);
        setIsAppealTimeExpired(false);
        return;
      }
      
      const deadline = new Date(revokedTime.getTime() + 24 * 60 * 60 * 1000);
      const now = new Date();
      const diff = deadline.getTime() - now.getTime();
      
      if (diff <= 0) {
        setIsAppealTimeExpired(true);
        setAppealTimeRemaining("00:00:00");
      } else {
        setIsAppealTimeExpired(false);
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setAppealTimeRemaining(
          `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        );
      }
    };
    
    calculateTimeRemaining();
    if (kycApp?.status === "REVOKED" && !isAppealTimeExpired && !isAppealRejected) {
      intervalId = setInterval(calculateTimeRemaining, 1000);
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [kycApp, isAppealTimeExpired, isAppealRejected]);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      if (authLoading) return;
      if (!user) {
        if (isMounted) {
          setProfile(null);
          setMyListings([]);
          setMyArenaAuctions([]);
          setKycApp(null);
          setPendingNameChange(null);
          setLoading(false);
        }
        return;
      }
      if (isMounted) setLoading(true);
      try {
        // Fetch authoritative KYC Application record from Firestore
        let kycData: KycApplication | null = null;
        try {
          const kycSnap = await getDoc(doc(db, "kyc_applications", user.uid));
          if (kycSnap.exists()) {
            kycData = { ...kycSnap.data(), id: kycSnap.id } as KycApplication;
            setKycApp(kycData);
          } else {
            setKycApp(null);
          }
        } catch (e) {
          console.warn("Live KYC loading error:", e);
        }

        // Also fetch protected private KYC data if available
        try {
          const privSnap = await getDoc(doc(db, "kyc_private", user.uid));
          if (privSnap.exists()) {
            const privData = privSnap.data();
            if (kycData) {
              kycData = { ...kycData, ...privData };
              setKycApp(kycData);
            }
          }
        } catch (e) {
          console.warn("Private KYC data load error:", e);
        }

        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as UserProfile;
          const userPhoto = data.photoURL || user.photoURL || userProfile?.photoURL || "";

          // Surgical PII Pruning: If legacy sensitive KYC PII exists in users collection, prune it immediately
          if (!IS_READONLY_INSPECTION_MODE && (data.cnicNumber || data.residentialAddress || (data as any).cnicFrontPhoto || (data as any).cnicBackPhoto || (data as any).selfiePhoto)) {
            try {
              const pruneUpdates: any = { updatedAt: serverTimestamp() };
              if (data.cnicNumber) pruneUpdates.cnicNumber = deleteField();
              if (data.residentialAddress) pruneUpdates.residentialAddress = deleteField();
              if ((data as any).cnicFrontPhoto) pruneUpdates.cnicFrontPhoto = deleteField();
              if ((data as any).cnicBackPhoto) pruneUpdates.cnicBackPhoto = deleteField();
              if ((data as any).selfiePhoto) pruneUpdates.selfiePhoto = deleteField();
              await updateDoc(docRef, pruneUpdates);
            } catch (pruneErr) {
              console.warn("Legacy PII pruning notice:", pruneErr);
            }
          }

          setProfile({ id: docSnap.id, ...data, photoURL: userPhoto });
          setFormData({
            name: data.name || user.displayName || userProfile?.name || "",
            realName: data.realName || data.name || user.displayName || userProfile?.name || "",
            businessName: data.businessName || "",
            phoneNumber: data.phoneNumber || userProfile?.phoneNumber || "",
            country: data.country || userProfile?.country || "",
            countryOfStay: data.countryOfStay || "",
            city: data.city || userProfile?.city || "",
            businessCity: data.businessCity || "",
            address: data.address || userProfile?.address || "",
            photoURL: userPhoto,
            bio: data.bio || userProfile?.bio || "",
            websiteUrl: data.websiteUrl || userProfile?.websiteUrl || "",
            facebookPage: data.facebookPage || userProfile?.facebookPage || "",
            email: data.email || user.email || userProfile?.email || "",
            cnicNumber: kycData?.cnicNumber || "",
            residentialAddress: kycData?.residentialAddress || "",
            businessAddress: kycData?.businessAddress || data.businessAddress || "",
            autoClearHistory: data.autoClearHistory || "off",
          });
          if (data.accountType) {
            setSettingsSection(data.accountType);
          }
        } else {
          // If profile does not exist, use auth data fallback and create document
          const defaultProf: UserProfile = {
            id: user.uid,
            name: user.displayName || userProfile?.name || "Avora Seller",
            email: user.email || userProfile?.email || "",
            phoneNumber: user.phoneNumber || userProfile?.phoneNumber || "",
            photoURL: user.photoURL || userProfile?.photoURL || "",
            isVerified: false,
            accountStatus: "active",
            createdAt: serverTimestamp() as any,
          };
          
          try {
            await setDoc(docRef, defaultProf);
          } catch (e) {
            console.warn("Could not create initial user profile doc:", e);
          }
          
          setProfile(defaultProf);
          setFormData({
            name: defaultProf.name || "",
            realName: defaultProf.name || "",
            businessName: "",
            phoneNumber: defaultProf.phoneNumber || "",
            country: "",
            countryOfStay: "",
            city: "",
            businessCity: "",
            address: "",
            photoURL: defaultProf.photoURL || "",
            bio: "",
            websiteUrl: "",
            facebookPage: "",
            email: user.email || "",
            cnicNumber: kycData?.cnicNumber || "",
            residentialAddress: kycData?.residentialAddress || "",
            businessAddress: kycData?.businessAddress || "",
            autoClearHistory: "off",
          });
        }

        try {
          const listingsQuery = query(
            collection(db, "listings"),
            where("ownerId", "==", user.uid),
            orderBy("createdAt", "desc"),
          );
          const listingsSnap = await getDocs(listingsQuery);
          setMyListings(
            listingsSnap.docs.map((d) => ({ ...d.data(), id: d.id }) as Listing),
          );
        } catch (eListings) {
          console.warn("Could not fetch standard listings:", eListings);
          // Keep default/fallback listings if Firestore fetch fails
        }

        try {
          const arenaQuery = query(
            collection(db, "arena_auctions"),
            where("sellerId", "==", user.uid)
          );
          const arenaSnap = await getDocs(arenaQuery);
          setMyArenaAuctions(
            arenaSnap.docs.map((d) => ({
              ...d.data(),
              id: d.id,
              startTime: d.data().startTime ? (typeof d.data().startTime.toDate === 'function' ? d.data().startTime.toDate() : new Date(d.data().startTime)) : new Date(),
              endTime: d.data().endTime ? (typeof d.data().endTime.toDate === 'function' ? d.data().endTime.toDate() : new Date(d.data().endTime)) : new Date(),
              createdAt: d.data().createdAt ? (typeof d.data().createdAt.toDate === 'function' ? d.data().createdAt.toDate() : new Date(d.data().createdAt)) : new Date()
            }) as AuctionItem)
          );
        } catch (eArena) {
          console.warn("Could not fetch arena auctions:", eArena);
        }
        
        try {
          const chatsQuery = query(
            collection(db, "chats"),
            where("sellerId", "==", user.uid)
          );
          const chatsSnap = await getDocs(chatsQuery);
          setChatCount(chatsSnap.size);
        } catch (eChats) {
          console.warn("Could not fetch chats count", eChats);
          setChatCount(0);
        }
        
        const appsQuery = query(
          collection(db, "verification_applications"),
          where("userId", "==", user.uid),
          orderBy("createdAt", "desc"),
          limit(1)
        );
        const appsSnap = await getDocs(appsQuery);
        if (!appsSnap.empty) {
          const app = appsSnap.docs[0].data();
          if (app.status === 'PENDING') setApplicationStatus('PENDING');
          else if (app.status === 'REJECTED') setApplicationStatus('REJECTED');
        }

        // 2. Fetch live or local-cached Name Change Request record
        try {
          const ncQuery = query(
            collection(db, "name_change_requests"),
            where("userId", "==", user.uid),
            orderBy("createdAt", "desc"),
            limit(1)
          );
          const ncSnap = await getDocs(ncQuery);
          if (!ncSnap.empty) {
            setPendingNameChange(ncSnap.docs[0].data() as NameChangeRequest);
          } else {
            try {
              const localNC = localStorage.getItem(`name_change_${user.uid}`);
              if (localNC) setPendingNameChange(JSON.parse(localNC));
            } catch (e) {}
          }
        } catch (e) {
          console.warn("Live NameChange request search localFallback:", e);
          try {
            const localNC = localStorage.getItem(`name_change_${user.uid}`);
            if (localNC) setPendingNameChange(JSON.parse(localNC));
          } catch (e2) {}
        }

      } catch (err: any) {
        console.error("Profile loadData query failed:", err);
        setLoading(false);

        // Fallback user profile setup from auth context
        if (userProfile) {
          setProfile(userProfile);
          setFormData({
            name: userProfile.name || user.displayName || "",
            realName: userProfile.realName || userProfile.name || user.displayName || "",
            businessName: userProfile.businessName || "",
            phoneNumber: userProfile.phoneNumber || user.phoneNumber || "",
            city: userProfile.city || "",
            address: userProfile.address || "",
            photoURL: userProfile.photoURL || user.photoURL || "",
            bio: userProfile.bio || "",
            websiteUrl: userProfile.websiteUrl || "",
            facebookPage: userProfile.facebookPage || "",
            email: user.email || userProfile.email || "",
            cnicNumber: userProfile.cnicNumber || "",
            residentialAddress: userProfile.residentialAddress || "",
            businessAddress: userProfile.businessAddress || "",
            autoClearHistory: userProfile.autoClearHistory || "off",
          });
        }
        if (isMounted) setMyListings([]);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, [user, authLoading]);

  // Handle KYC Front image selection with watermark
  const handleCnicUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setWatermarkingActive(true);
    setKycError("");
    try {
      const watermarked = await processImageWithWatermark(file);
      setKycFrontPhoto(watermarked);
    } catch (err: any) {
      setKycError(err.message || "Failed to process image.");
    } finally {
      setWatermarkingActive(false);
    }
  };

  // Handle KYC Back image selection with watermark
  const handleCnicBackUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setWatermarkingActive(true);
    setKycError("");
    try {
      const watermarked = await processImageWithWatermark(file);
      setKycBackPhoto(watermarked);
    } catch (err: any) {
      setKycError(err.message || "Failed to process image.");
    } finally {
      setWatermarkingActive(false);
    }
  };

  // Handle KYC Selfie image selection with watermark
  const handleSelfieUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setWatermarkingActive(true);
    setKycError("");
    try {
      const watermarked = await processImageWithWatermark(file);
      setKycSelfiePhoto(watermarked);
    } catch (err: any) {
      setKycError(err.message || "Failed to process image.");
    } finally {
      setWatermarkingActive(false);
    }
  };

  // Handle KYC Business Doc image selection with watermark
  const handleBusinessDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setWatermarkingActive(true);
    setKycError("");
    try {
      const watermarked = await processImageWithWatermark(file);
      setKycBusinessDocPhoto(watermarked);
    } catch (err: any) {
      setKycError(err.message || "Failed to process image.");
    } finally {
      setWatermarkingActive(false);
    }
  };

  // Handle KYC Representative Authority Letter selection with watermark
  const handleRepAuthorityLetterUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setWatermarkingActive(true);
    setKycError("");
    try {
      const watermarked = await processImageWithWatermark(file);
      setKycRepAuthorityLetter(watermarked);
    } catch (err: any) {
      setKycError(err.message || "Failed to process image.");
    } finally {
      setWatermarkingActive(false);
    }
  };

  // Handle KYC Application Submission
  const handleKycSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setKycError("");
    
    // Validate fields
    if (!kycLegalName.trim()) {
      setKycError(kycCategory === "FIRM_COMPANY" ? "Authorized Representative Legal Name is required." : "Full legal name is required.");
      return;
    }
    if ((kycCategory === "OWN_BUSINESS" || kycCategory === "BUSINESS") && !kycBusinessName.trim()) {
      setKycError("Business / Trading Name is mandatory for Own Business category.");
      return;
    }
    if (kycCategory === "FIRM_COMPANY" && !kycCompanyName.trim()) {
      setKycError("Company / Firm Registered Legal Name is mandatory for Firm / Company category.");
      return;
    }
    if (kycCategory === "FIRM_COMPANY" && !kycRegistrationNumber.trim()) {
      setKycError("Company Registration / Incorporation Number is mandatory for Firm / Company category.");
      return;
    }
    if (kycCategory === "FIRM_COMPANY" && !kycRepDesignation.trim()) {
      setKycError("Representative Designation / Role is mandatory for Firm / Company category.");
      return;
    }
    if ((kycCategory === "OWN_BUSINESS" || kycCategory === "BUSINESS" || kycCategory === "FIRM_COMPANY") && !kycBusinessAddress.trim()) {
      setKycError(kycCategory === "FIRM_COMPANY" ? "Registered Office / Business Address is mandatory." : "Business / Trading Address is mandatory.");
      return;
    }
    if (kycCategory === "INDIVIDUAL" && !kycResidentialAddress.trim()) {
      setKycError("Residential Address is mandatory for Individual category.");
      return;
    }
    
    // Validate Government-Issued Identity Document is provided
    if (!kycCnicNumber.trim()) {
      setKycError(kycCategory === "FIRM_COMPANY" ? "Representative Identity Document Number is required." : "Government-Issued Identity Document Number is required.");
      return;
    }
    if (kycCnicNumber.trim().length < 3) {
      setKycError("Please enter a valid Identity Document Number.");
      return;
    }
    
    if (!kycFrontPhoto) {
      setKycError("Front picture of Identity Document is required.");
      return;
    }
    // Back picture of Identity Document is optional
    if (!kycSelfiePhoto) {
      setKycError(kycCategory === "FIRM_COMPANY" ? "Representative selfie photo with watermark is required." : "Selfie photo with watermark is required.");
      return;
    }
    
    // Validate Mobile Number (at least 11 digits)
    const cleanPhone = kycMobileNumber.replace(/[^0-9]/g, "");
    if (cleanPhone.length < 11) {
      setKycError("Phone number must contain at least 11 digits.");
      return;
    }
    
    if (!kycCountry) {
      setKycError("Country is required.");
      return;
    }
    if (!kycCity.trim()) {
      setKycError("City/Location is required.");
      return;
    }

    // Check if Terms & Conditions are accepted. If not, open terms modal!
    if (!kycTermsAccepted) {
      setShowKycTermsModal(true);
      return;
    }

    setKycSubmitting(true);
    try {
      const appId = user.uid; // Limit one active application per user
      const finalTrackingNumber = kycTrackingNumber || kycApp?.trackingNumber || "MND-KYC-" + Math.floor(100000 + Math.random() * 900000);
      const now = new Date().toISOString();
      const isResubmission = kycApp?.status === "REJECTED" || kycApp?.status === "PERMANENTLY_REMOVED";
      const actionText = isResubmission ? "Resubmitted" : "Submitted";
      const historyItem = {
        action: actionText,
        status: "PENDING",
        timestamp: now,
        reason: isResubmission ? "Application updated and resubmitted with updated details." : "Fresh KYC Application submitted."
      };

      const updatedHistory = [
        ...(kycApp?.history || []),
        historyItem
      ];

      const resolvedBusinessName = kycCategory === "FIRM_COMPANY" 
        ? kycCompanyName.trim() 
        : (kycCategory === "OWN_BUSINESS" || kycCategory === "BUSINESS") 
          ? kycBusinessName.trim() 
          : "";

      const application: KycApplication = {
        id: appId,
        userId: user.uid,
        userEmail: user.email || "no-email@mandi.pk",
        category: kycCategory,
        legalName: kycLegalName.trim(),
        businessName: resolvedBusinessName,
        cnicNumber: kycCnicNumber,
        cnicFrontPhoto: kycFrontPhoto,
        cnicBackPhoto: kycBackPhoto,
        selfiePhoto: kycSelfiePhoto,
        mobileNumber: kycMobileNumber.trim(),
        country: kycCountry,
        countryOfStay: kycCountryOfStay,
        city: kycCity.trim(),
        residentialAddress: kycCategory === "INDIVIDUAL" ? kycResidentialAddress.trim() : "",
        businessAddress: (kycCategory === "OWN_BUSINESS" || kycCategory === "BUSINESS" || kycCategory === "FIRM_COMPANY") ? kycBusinessAddress.trim() : "",
        status: "PENDING",
        submittedAt: now as any,
        trackingNumber: finalTrackingNumber,
        history: updatedHistory,
        // Global KYC & Firm / Company fields
        documentType: kycDocumentType,
        businessType: (kycCategory === "OWN_BUSINESS" || kycCategory === "BUSINESS") ? kycBusinessType.trim() : undefined,
        businessPhone: kycBusinessPhone.trim() || undefined,
        businessDocPhoto: kycBusinessDocPhoto || undefined,
        companyName: kycCategory === "FIRM_COMPANY" ? kycCompanyName.trim() : undefined,
        registrationNumber: kycCategory === "FIRM_COMPANY" ? kycRegistrationNumber.trim() : undefined,
        repName: kycCategory === "FIRM_COMPANY" ? kycLegalName.trim() : undefined,
        repDesignation: kycCategory === "FIRM_COMPANY" ? kycRepDesignation.trim() : undefined,
        repIdentityNumber: kycCategory === "FIRM_COMPANY" ? kycCnicNumber : undefined,
        repFrontPhoto: kycCategory === "FIRM_COMPANY" ? kycFrontPhoto : undefined,
        repBackPhoto: kycCategory === "FIRM_COMPANY" ? kycBackPhoto : undefined,
        repSelfiePhoto: kycCategory === "FIRM_COMPANY" ? kycSelfiePhoto : undefined,
        repAuthorityLetter: kycCategory === "FIRM_COMPANY" && kycRepAuthorityLetter ? kycRepAuthorityLetter : undefined,
      };

      // 1. Authoritative write to kyc_applications
      await setDoc(doc(db, "kyc_applications", user.uid), application);
      
      // 2. Authoritative write to kyc_private (strictly protected PII)
      await setDoc(doc(db, "kyc_private", user.uid), {
        userId: user.uid,
        userEmail: user.email || "",
        category: kycCategory,
        legalName: kycLegalName.trim(),
        businessName: resolvedBusinessName,
        cnicNumber: kycCnicNumber,
        cnicFrontPhoto: kycFrontPhoto,
        cnicBackPhoto: kycBackPhoto,
        selfiePhoto: kycSelfiePhoto,
        mobileNumber: kycMobileNumber.trim(),
        country: kycCountry,
        countryOfStay: kycCountryOfStay,
        city: kycCity.trim(),
        residentialAddress: kycCategory === "INDIVIDUAL" ? kycResidentialAddress.trim() : "",
        businessAddress: (kycCategory === "OWN_BUSINESS" || kycCategory === "BUSINESS" || kycCategory === "FIRM_COMPANY") ? kycBusinessAddress.trim() : "",
        documentType: kycDocumentType,
        businessType: (kycCategory === "OWN_BUSINESS" || kycCategory === "BUSINESS") ? kycBusinessType.trim() : "",
        businessPhone: kycBusinessPhone.trim() || "",
        businessDocPhoto: kycBusinessDocPhoto || "",
        companyName: kycCategory === "FIRM_COMPANY" ? kycCompanyName.trim() : "",
        registrationNumber: kycCategory === "FIRM_COMPANY" ? kycRegistrationNumber.trim() : "",
        repName: kycCategory === "FIRM_COMPANY" ? kycLegalName.trim() : "",
        repDesignation: kycCategory === "FIRM_COMPANY" ? kycRepDesignation.trim() : "",
        repIdentityNumber: kycCategory === "FIRM_COMPANY" ? kycCnicNumber : "",
        repFrontPhoto: kycCategory === "FIRM_COMPANY" ? kycFrontPhoto : "",
        repBackPhoto: kycCategory === "FIRM_COMPANY" ? kycBackPhoto : "",
        repSelfiePhoto: kycCategory === "FIRM_COMPANY" ? kycSelfiePhoto : "",
        repAuthorityLetter: kycCategory === "FIRM_COMPANY" && kycRepAuthorityLetter ? kycRepAuthorityLetter : "",
        trackingNumber: finalTrackingNumber,
        submittedAt: now as any,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      // 3. Update public users collection WITHOUT sensitive PII (no cnicNumber or residentialAddress)
      const userPublicUpdate: any = {
        kycType: kycCategory,
        realName: kycLegalName.trim(),
        businessName: resolvedBusinessName,
        phoneNumber: kycMobileNumber.trim(),
        country: kycCountry,
        countryOfStay: kycCountryOfStay,
        city: kycCity.trim(),
        updatedAt: serverTimestamp(),
      };
      if ((kycCategory === "OWN_BUSINESS" || kycCategory === "BUSINESS" || kycCategory === "FIRM_COMPANY") && kycBusinessAddress.trim()) {
        userPublicUpdate.address = kycBusinessAddress.trim();
      }
      await setDoc(doc(db, "users", user.uid), userPublicUpdate, { merge: true });
      
      // Add notification
      const notifRef = doc(collection(db, "notifications"));
      await setDoc(notifRef, {
        id: notifRef.id,
        userId: user.uid,
        type: "KYC_SUBMITTED",
        title: "KYC Application Submitted",
        message: `Your KYC Verification is successfully filed as ${kycCategory === "FIRM_COMPANY" ? "Firm / Company" : kycCategory === "OWN_BUSINESS" ? "Own Business" : "Individual"}. Status: Pending Review.`,
        read: false,
        createdAt: serverTimestamp(),
      });

      setKycApp(application);
      
      // Update local profile state and form data
      if (profile) {
        setProfile({
          ...profile,
          kycStatus: "PENDING",
          kycType: kycCategory,
          realName: kycLegalName.trim(),
          businessName: resolvedBusinessName,
          phoneNumber: kycMobileNumber.trim(),
          address: (kycCategory === "OWN_BUSINESS" || kycCategory === "BUSINESS" || kycCategory === "FIRM_COMPANY") ? kycBusinessAddress.trim() : "",
          businessAddress: (kycCategory === "OWN_BUSINESS" || kycCategory === "BUSINESS" || kycCategory === "FIRM_COMPANY") ? kycBusinessAddress.trim() : "",
          companyName: kycCategory === "FIRM_COMPANY" ? kycCompanyName.trim() : undefined,
        });
      }
      setFormData((prev) => ({
        ...prev,
        realName: kycLegalName.trim(),
        businessName: resolvedBusinessName,
        phoneNumber: kycMobileNumber.trim(),
        address: (kycCategory === "OWN_BUSINESS" || kycCategory === "BUSINESS" || kycCategory === "FIRM_COMPANY") ? kycBusinessAddress.trim() : "",
        cnicNumber: kycCnicNumber,
        residentialAddress: kycCategory === "INDIVIDUAL" ? kycResidentialAddress.trim() : "",
        businessAddress: (kycCategory === "OWN_BUSINESS" || kycCategory === "BUSINESS" || kycCategory === "FIRM_COMPANY") ? kycBusinessAddress.trim() : "",
      }));

      setIsEditingKyc(false);
      setKycTrackingNumber("");

      alert("KYC verification application submitted successfully! It is now Pending Review.");
    } catch (saveErr: any) {
      setKycError(saveErr.message || "Failed to submit application.");
    } finally {
      setKycSubmitting(false);
    }
  };

  const [appealMessage, setAppealMessage] = useState("");

  const handleRequestResume = async () => {
    if (!user) return;
    const msg = appealMessage.trim();
    if (!msg) {
      alert("Please write an appeal message before submitting.");
      return;
    }
    setKycSubmitting(true);
    try {
      const targetAppDocId = kycApp?.id || user.uid;
      const batch = writeBatch(db);

      const appealData = {
        status: "RESUME_REQUESTED",
        resumeRequestedAt: serverTimestamp(),
        appealMessage: msg,
        appealStatus: "PENDING",
      };

      batch.set(doc(db, "kyc_applications", targetAppDocId), appealData, { merge: true });
      if (user.uid !== targetAppDocId) {
        batch.set(doc(db, "kyc_applications", user.uid), appealData, { merge: true });
      }

      batch.set(doc(db, "kyc_private", user.uid), {
        kycStatus: "RESUME_REQUESTED",
        resumeRequestedAt: serverTimestamp(),
        appealMessage: msg,
        appealStatus: "PENDING",
        updatedAt: serverTimestamp(),
      }, { merge: true });

      await batch.commit();

      // Secondary notification dispatch: Decoupled from core KYC batch
      try {
        const notifRef = doc(collection(db, "notifications"));
        await setDoc(notifRef, {
          id: notifRef.id,
          userId: user.uid,
          type: "KYC_APPEAL_SUBMITTED",
          relatedId: targetAppDocId,
          title: "Appeal Submitted",
          message: "Your appeal for KYC verification restoration has been received and is under review.",
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch (notifErr) {
        console.warn("[Profile.handleRequestResume] Failed to dispatch appeal notification:", notifErr);
      }

      if (kycApp) {
        setKycApp({
          ...kycApp,
          status: "RESUME_REQUESTED",
          resumeRequestedAt: new Date().toISOString() as any,
          appealMessage: msg,
          appealStatus: "PENDING",
        });
      }

      if (profile) {
        setProfile({
          ...profile,
          kycStatus: "RESUME_REQUESTED",
        });
      }

      alert("Appeal submitted successfully. Please wait for an admin to review it.");
      setAppealMessage("");
    } catch (err: any) {
      console.error("Failed to submit appeal request:", err);
      alert(err.message || "Failed to submit appeal request.");
    } finally {
      setKycSubmitting(false);
    }
  };

  const handleUsernameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    const desired = newUsernameInput.trim();
    if (!/^[a-zA-Z0-9$\-._]+$/.test(desired)) {
      alert("Username can only contain letters, numbers, and symbols: $ - . _");
      return;
    }
    if (desired === profile.username) {
      setShowUsernameModal(false);
      return;
    }
    
    // Check 24-hour cooldown
    if (profile.lastUsernameChangedAt) {
      const parseTime = (val: any) => {
        if (!val) return null;
        if (typeof val.toDate === "function") return val.toDate();
        if (val.seconds) return new Date(val.seconds * 1000);
        const d = new Date(val);
        return !isNaN(d.getTime()) ? d : null;
      };
      const lastChanged = parseTime(profile.lastUsernameChangedAt);
      if (lastChanged) {
        const diffMs = Date.now() - lastChanged.getTime();
        const cooldownMs = 24 * 60 * 60 * 1000;
        if (diffMs < cooldownMs) {
          const remainingMs = cooldownMs - diffMs;
          const remainingHours = Math.floor(remainingMs / (60 * 60 * 1000));
          const remainingMinutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
          alert(`You can't change the username within 24 hours of your last username change.\nRemaining time: ${remainingHours} hours and ${remainingMinutes} minutes.`);
          return;
        }
      }
    }

    setUsernameChangeLoading(true);
    try {
      const isUnique = await checkUsernameUnique(desired);
      if (!isUnique) {
        alert("This username is already taken. Please choose another.");
        setUsernameChangeLoading(false);
        return;
      }
      
      if (isKycVerified) {
        const ncId = `nc_${user.uid}_${Date.now()}`;
        const ncRequest: NameChangeRequest = {
          id: ncId,
          userId: user.uid,
          oldUsername: profile.username || "",
          newUsername: desired,
          reason: "Username Change Request",
          status: "PENDING",
          createdAt: serverTimestamp() as any
        };
        await setDoc(doc(db, "name_change_requests", ncId), ncRequest);
        setPendingNameChange(ncRequest);
        
        try {
          const stored = localStorage.getItem(`name_change_${user.uid}`);
          let updated = { ...ncRequest };
          if (stored) {
             const parsed = JSON.parse(stored);
             updated = { ...parsed, newUsername: desired };
          }
          localStorage.setItem(`name_change_${user.uid}`, JSON.stringify(updated));
        } catch (e) {}

        alert("Username change request submitted for admin approval.");
        setShowUsernameModal(false);
      } else {
        const oldUsername = profile?.username;
        const updates: any = { 
          username: desired,
          lastUsernameChangedAt: serverTimestamp()
        };
        if (oldUsername && oldUsername !== desired) {
          updates.pastUsernames = arrayUnion(oldUsername);
        }
        await updateDoc(doc(db, "users", user.uid), updates);
        setProfile(prev => {
          if (!prev) return null;
          const past = prev.pastUsernames || [];
          const updatedPast = oldUsername && oldUsername !== desired && !past.includes(oldUsername)
            ? [...past, oldUsername]
            : past;
          const updated = {
            ...prev,
            username: desired,
            pastUsernames: updatedPast,
            lastUsernameChangedAt: new Date()
          };
          primeUserProfileCache(user.uid, updated);
          return updated;
        });
        alert("Username updated successfully.");
        setShowUsernameModal(false);
      }
    } catch (err: any) {
      alert(err.message || "Failed to update username");
    } finally {
      setUsernameChangeLoading(false);
    }
  };

  // Submit identity change request
  const handleNameChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    
    const hasAnyChange = 
      nameChangeNewRealName.trim() !== (profile.realName || "") ||
      nameChangeNewBusinessName.trim() !== (profile.businessName || "") ||
      nameChangeNewEmail.trim() !== (profile.email || "") ||
      nameChangeNewCnicNumber.trim() !== (profile.cnicNumber || kycApp?.cnicNumber || "") ||
      nameChangeNewResidentialAddress.trim() !== (profile.residentialAddress || kycApp?.residentialAddress || "") ||
      nameChangeNewBusinessAddress.trim() !== (profile.businessAddress || kycApp?.businessAddress || "");

    if (!hasAnyChange && !nameChangeNewName.trim()) {
      setNameChangeMsg("Please provide at least one change to request.");
      return;
    }
    
    if (!nameChangeReason.trim()) {
      setNameChangeMsg("Reason for change is required.");
      return;
    }

    setNameChangeSubmitting(true);
    setNameChangeMsg("");

    try {
      const ncId = String(Date.now());
      const ncRequest: NameChangeRequest = {
        id: ncId,
        userId: user.uid,
        oldName: profile.name || "",
        newName: (nameChangeNewBusinessName.trim() || nameChangeNewRealName.trim() || profile.name || ""),
        oldRealName: profile.realName || "",
        newRealName: nameChangeNewRealName.trim(),
        oldBusinessName: profile.businessName || "",
        newBusinessName: nameChangeNewBusinessName.trim(),
        oldEmail: profile.email || user.email || "",
        newEmail: nameChangeNewEmail.trim(),
        oldCnicNumber: profile.cnicNumber || kycApp?.cnicNumber || "",
        newCnicNumber: nameChangeNewCnicNumber.trim(),
        oldResidentialAddress: profile.residentialAddress || kycApp?.residentialAddress || "",
        newResidentialAddress: nameChangeNewResidentialAddress.trim(),
        oldBusinessAddress: profile.businessAddress || kycApp?.businessAddress || "",
        newBusinessAddress: nameChangeNewBusinessAddress.trim(),
        reason: nameChangeReason.trim(),
        status: "PENDING",
        createdAt: new Date().toISOString() as any,
      };

      let writeSucceeded = false;
      if (!(typeof window !== "undefined" && (window as any).__firestore_quota_exceeded)) {
        try {
          await setDoc(doc(db, "name_change_requests", ncId), ncRequest);
          await setDoc(doc(db, "users", user.uid), {
            hasPendingNameChange: true
          }, { merge: true });
          writeSucceeded = true;
        } catch (dbErr: any) {
          console.warn("Firestore Identity Change save failed, falling back local:", dbErr);
          if (dbErr.message?.includes("quota")) {
            (window as any).__firestore_quota_exceeded = true;
          }
        }
      }

      // Save to local storage cache
      try {
        localStorage.setItem(`name_change_${user.uid}`, JSON.stringify(ncRequest));
      } catch (e) {}
      setPendingNameChange(ncRequest);
      setProfile({
        ...profile,
        hasPendingNameChange: true
      });

      alert("Identity change request submitted successfully to admin! Your request is now pending review.");
      setShowNameChangeModal(false);
    } catch (err: any) {
      setNameChangeMsg(err.message || "Failed to submit request.");
    } finally {
      setNameChangeSubmitting(false);
    }
  };

  const handleBadgeAppealSubmit = async () => {
    if (!profile || !user) return;
    const msg = window.prompt("Please enter your appeal explanation (explain to admin why your Premium Seller badge should be resumed):");
    if (msg === null) return;
    if (!msg.trim()) {
      alert("An explanation is required to submit an appeal.");
      return;
    }

    try {
      const updateData = {
        verifiedBadgeRequestStatus: "RESUME_REQUESTED",
        appealMessage: msg.trim(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, "users", user.uid), updateData, { merge: true });

      // Sync with promotionRequests so the appeal routes to Admin Dashboard -> Appeals
      try {
        const pQ = query(
          collection(db, "promotionRequests"),
          where("userId", "==", user.uid),
          where("type", "==", "VERIFIED")
        );
        const pSnap = await getDocs(pQ);
        if (!pSnap.empty) {
          for (const d of pSnap.docs) {
            await updateDoc(doc(db, "promotionRequests", d.id), {
              status: "RESUME_REQUESTED",
              appealMessage: msg.trim(),
              resumeRequestedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        } else {
          // If badge was directly granted without a prior application document
          await addDoc(collection(db, "promotionRequests"), {
            userId: user.uid,
            targetId: user.uid,
            type: "VERIFIED",
            planName: "Premium Seller Badge",
            applicantEmail: user.email || profile.email || "",
            applicantName: user.displayName || profile.name || "",
            status: "RESUME_REQUESTED",
            appealMessage: msg.trim(),
            resumeRequestedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            durationDays: 30,
            amount: 0,
          });
        }
      } catch (err) {
        console.warn("Could not sync promotionRequests for badge appeal:", err);
      }

      setProfile({
        ...profile,
        ...updateData
      });
      alert("Your appeal has been successfully submitted immediately! The admin team will review it shortly.");
    } catch (e) {
      console.error("Error submitting badge appeal:", e);
      alert("Failed to submit appeal. Please try again.");
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, photoURL: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    try {
      const publicName = settingsSection === 'BUSINESS' && formData.businessName.trim()
        ? formData.businessName.trim()
        : (formData.businessName.trim() || formData.realName.trim() || formData.name);
      
      const docRef = doc(db, "users", user.uid);
      const updateData: Partial<UserProfile> = {
        ...formData,
        name: publicName,
        accountType: settingsSection,
        email: user.email || "",
        updatedAt: serverTimestamp(),
      };

      if (isKycLocked && !profile?.isNameChangeAllowed) {
        if (profile) {
          updateData.realName = profile.realName || "";
          updateData.businessName = profile.businessName || "";
          updateData.businessAddress = profile.businessAddress || "";
        }
      }

      if (profile?.isNameChangeAllowed) {
        updateData.isNameChangeAllowed = false;
        try {
          localStorage.removeItem(`name_change_${user.uid}`);
        } catch (e) {}
        setPendingNameChange(null);

        // Also update kyc_applications and kyc_private if user is verified
        try {
          await setDoc(doc(db, "kyc_applications", user.uid), {
            legalName: formData.realName,
            businessName: formData.businessName,
            cnicNumber: formData.cnicNumber,
            residentialAddress: formData.residentialAddress,
            businessAddress: formData.businessAddress,
          }, { merge: true });

          await setDoc(doc(db, "kyc_private", user.uid), {
            legalName: formData.realName,
            businessName: formData.businessName,
            cnicNumber: formData.cnicNumber,
            residentialAddress: formData.residentialAddress,
            businessAddress: formData.businessAddress,
            updatedAt: serverTimestamp(),
          }, { merge: true });
        } catch (err) {
          console.error("Failed to update kyc records in handleSave:", err);
        }
      }

      // Sync address properly for approved/revoked KYC users
      const isKycApprovedOrRevoked = profile?.kycStatus === "APPROVED" || profile?.kycStatus === "REVOKED";
      const userKycCategory = profile?.kycType || kycApp?.category || "INDIVIDUAL";
      if (isKycApprovedOrRevoked) {
        if (userKycCategory === "BUSINESS" && formData.businessAddress) {
          updateData.address = formData.businessAddress;
        }
      }

      // Strip private & unallowed non-whitelisted keys before writing to users/{user.uid}
      delete (updateData as any).cnicNumber;
      delete (updateData as any).residentialAddress;
      delete (updateData as any).businessCity;
      delete (updateData as any).businessAddress;
      delete (updateData as any).autoClearHistory;

      if (!profile) {
        await setDoc(docRef, {
          ...updateData,
          id: user.uid,
          isVerified: false,
          createdAt: serverTimestamp(),
        });
      } else {
        await updateDoc(docRef, updateData);
      }
      
      const newProfileState = profile ? { ...profile, ...updateData } : ({ ...updateData, id: user.uid } as UserProfile);
      setProfile(newProfileState);
      primeUserProfileCache(user.uid, newProfileState);
      
      alert("Profile updated successfully!");
      setActiveTab("profile");
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, "users");
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  };

  const submitVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!txnId && !proofUrl) {
      alert("Please provide either a Tracking ID or a link to Payment Proof.");
      return;
    }
    try {
      setIsApplying(true);
      await addDoc(collection(db, "verification_applications"), {
        userId: user.uid,
        userName: profile?.name || user.displayName || "Unknown",
        userEmail: user.email || "",
        paymentProofUrl: proofUrl,
        transactionId: txnId,
        durationDays: parseInt(applyDuration, 10),
        status: 'PENDING',
        createdAt: serverTimestamp(),
      });
      setApplicationStatus('PENDING');
      alert("Application submitted successfully. Our team will review it shortly.");
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "verification_applications");
    } finally {
      setIsApplying(false);
    }
  };

  const [showShareToast, setShowShareToast] = useState(false);

  const handleShare = async () => {
    if (!profile) return;
    const profileUrl = profile.username 
      ? `${window.location.origin}/user/${profile.username}` 
      : `${window.location.origin}/user/${profile.id}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Check out my profile`,
          text: `View my profile on Avora`,
          url: profileUrl,
        });
      } catch (e) {
        console.warn("Error sharing:", e);
      }
    } else {
      try {
        await navigator.clipboard.writeText(profileUrl);
        setShowShareToast(true);
        setTimeout(() => setShowShareToast(false), 3000);
      } catch (e) {
        console.error("Error writing to clipboard:", e);
      }
    }
  };

  if (!user) {
    return <AuthModal isOpen={true} isPage={true} onClose={() => navigate("/")} />;
  }

  if (loading)
    return (
      <div className="py-20 text-center flex flex-col items-center">
        <div className="w-10 h-10 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin mb-4" />
        <p className="text-stone-400 font-black text-xs uppercase tracking-[0.3em]">
          Loading Profile...
        </p>
      </div>
    );

  if (!profile)
    return (
      <div className="py-20 text-center text-stone-400">
        Profile data not available.
      </div>
    );

  const isBadgeActive =
    profile && profile.isVerified && isKycActiveApproved &&
    (!profile.verifiedUntil || (() => {
      const vu = profile.verifiedUntil;
      if (typeof vu.toDate === 'function') return vu.toDate() > new Date();
      if (vu.seconds) return new Date(vu.seconds * 1000) > new Date();
      const d = new Date(vu);
      return !isNaN(d.getTime()) ? d > new Date() : true;
    })());
  // Duplicates removed.
  const handleStartEditKyc = () => {
    if (!kycApp) return;
    setIsEditingKyc(true);
    setKycCategory(kycApp.category as any);
    setKycLegalName(kycApp.legalName || "");
    setKycBusinessName(kycApp.businessName || "");
    setKycBusinessType((kycApp as any).businessType || "");
    setKycCnicNumber(kycApp.cnicNumber || "");
    setKycFrontPhoto(kycApp.cnicFrontPhoto || "");
    setKycBackPhoto(kycApp.cnicBackPhoto || "");
    setKycSelfiePhoto(kycApp.selfiePhoto || "");
    setKycBusinessDocPhoto((kycApp as any).businessDocPhoto || "");
    setKycMobileNumber(kycApp.mobileNumber || "");
    setKycBusinessPhone((kycApp as any).businessPhone || "");
    setKycCountry(kycApp.country || "");
    setKycCountryOfStay(kycApp.countryOfStay || "");
    setKycCity(kycApp.city || "");
    setKycResidentialAddress(kycApp.residentialAddress || "");
    setKycBusinessAddress(kycApp.businessAddress || "");
    setKycDocumentType((kycApp as any).documentType || "NATIONAL_ID");
    setKycCompanyName((kycApp as any).companyName || "");
    setKycRegistrationNumber((kycApp as any).registrationNumber || "");
    setKycRepDesignation((kycApp as any).repDesignation || "");
    setKycRepAuthorityLetter((kycApp as any).repAuthorityLetter || "");
    setKycTrackingNumber(kycApp.trackingNumber || "");
  };

  const handleStartFreshKyc = () => {
    setIsEditingKyc(true);
    setKycCategory("INDIVIDUAL");
    setKycLegalName("");
    setKycBusinessName("");
    setKycBusinessType("");
    setKycCnicNumber("");
    setKycFrontPhoto("");
    setKycBackPhoto("");
    setKycSelfiePhoto("");
    setKycBusinessDocPhoto("");
    setKycMobileNumber("");
    setKycBusinessPhone("");
    setKycCountry("");
    setKycCountryOfStay("");
    setKycCity("");
    setKycResidentialAddress("");
    setKycBusinessAddress("");
    setKycDocumentType("NATIONAL_ID");
    setKycCompanyName("");
    setKycRegistrationNumber("");
    setKycRepDesignation("");
    setKycRepAuthorityLetter("");
    setKycTrackingNumber("MND-KYC-" + Math.floor(100000 + Math.random() * 900000));
  };
  
  const isFieldLocked = (fieldName: string) => {
    if (!isKycVerified) return false;
    if (profile?.isNameChangeAllowed) return false;
    if (fieldName === "email") return true; // Locked forever for manual edits
    if (isIndividual) {
      return ["realName", "cnicNumber", "residentialAddress"].includes(fieldName);
    }
    if (isBusiness) {
      return ["realName", "businessName", "cnicNumber", "businessAddress"].includes(fieldName);
    }
    return false;
  };

  const openNameChangeForField = () => {
    setNameChangeNewName("");
    setNameChangeNewRealName(profile?.realName || "");
    setNameChangeNewBusinessName(profile?.businessName || "");
    setNameChangeNewEmail(profile?.email || "");
    setNameChangeNewCnicNumber(profile?.cnicNumber || kycApp?.cnicNumber || "");
    setNameChangeNewResidentialAddress(profile?.residentialAddress || kycApp?.residentialAddress || "");
    setNameChangeNewBusinessAddress(profile?.businessAddress || kycApp?.businessAddress || "");
    setNameChangeReason("");
    setNameChangeMsg("");
    setShowNameChangeModal(true);
  };

  const unifiedListings = [
    ...myListings.map((item) => ({
      id: item.id,
      title: item.title,
      priceText: `${(item.price || 0).toLocaleString()} PKR`,
      image: item.images?.[0] || "https://images.unsplash.com/photo-1543083115-638c32cd3d58?w=400",
      categoryName: "Standard Ad",
      type: "marketplace" as const,
      exploreUrl: `/listings/${item.id}`,
      images: item.images && item.images.length > 0 ? item.images : ["https://images.unsplash.com/photo-1543083115-638c32cd3d58?w=400"]
    })),
    ...myArenaAuctions.map((item) => {
      const isNeg = item.isNegotiationOnly === true;
      return {
        id: item.id,
        title: item.title,
        priceText: isNeg ? `Starting: ${(item.startingPrice || 0).toLocaleString()} PKR` : `Current Bid: ${(item.currentBid || item.startingPrice || 0).toLocaleString()} PKR`,
        image: item.images?.[0] || "https://images.unsplash.com/photo-1543083115-638c32cd3d58?w=400",
        categoryName: isNeg ? "Private Offer" : "Arena Auction",
        type: isNeg ? "negotiation" : "arena" as const,
        exploreUrl: isNeg ? `/negotiations?item=${item.id}` : `/battle-bids?id=${item.id}`,
        images: item.images && item.images.length > 0 ? item.images : ["https://images.unsplash.com/photo-1543083115-638c32cd3d58?w=400"]
      };
    })
  ];

  const filteredUnifiedListings = unifiedListings.filter(item => {
    const matchesCategory = myListingsCategoryFilter === 'ALL' || item.type === myListingsCategoryFilter;
    const matchesSearch = !myListingsSearchTerm.trim() || 
      item.title.toLowerCase().includes(myListingsSearchTerm.toLowerCase()) ||
      item.categoryName.toLowerCase().includes(myListingsSearchTerm.toLowerCase()) ||
      item.priceText.toLowerCase().includes(myListingsSearchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-500 pb-24 space-y-8">
      {/* Share Toast */}
      {showShareToast && (
        <div className="fixed top-24 right-4 bg-stone-900 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg animate-in fade-in slide-in-from-top-2 z-50">
          Link copied to clipboard!
        </div>
      )}

      {/* Account Ban Notice & Appeal Flow */}
      <AccountBannedBanner variant="light" className="mb-2" />

          {/* Account Center Navigation Bar with ☰ Three-Line Menu */}
          <div className="relative z-30 mb-4" ref={menuRef}>
            <div className="bg-stone-900 text-white p-3.5 sm:p-4 rounded-2xl sm:rounded-3xl shadow-lg border border-stone-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {/* ☰ Three-Line Menu Button */}
                <button
                  type="button"
                  onClick={() => setIsMenuOpen((prev) => !prev)}
                  aria-label="Open profile navigation menu"
                  aria-expanded={isMenuOpen}
                  className="p-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-xl transition-all font-black flex items-center justify-center shrink-0 shadow-md active:scale-95 cursor-pointer"
                  title="Account Navigation Menu"
                >
                  {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>

                <div className="flex flex-col">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-400">
                    Account Center
                  </span>
                  <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-stone-100 flex items-center gap-1.5">
                    {activeTab === "profile" && "Profile Overview"}
                    {activeTab === "settings" && "Account Settings"}
                    {activeTab === "kyc" && "KYC Identity Verification"}
                    {activeTab === "trust" && "Trust Score Ledger"}
                  </span>
                </div>
              </div>

              {/* Section Indicator Pill */}
              <div className="hidden sm:flex items-center gap-1.5 bg-stone-800/80 px-3.5 py-1.5 rounded-full border border-stone-700 text-xs font-black uppercase tracking-wider text-amber-400">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span>
                  {activeTab === "profile" && "Profile"}
                  {activeTab === "settings" && "Settings"}
                  {activeTab === "kyc" && "KYC Verification"}
                  {activeTab === "trust" && "Trust Score Ledger"}
                </span>
              </div>
            </div>

            {/* Dropdown Menu when ☰ is open */}
            <AnimatePresence>
              {isMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 4, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 top-full mt-2 w-full sm:w-80 bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-stone-200 p-2.5 z-[100] overflow-hidden"
                >
                  <div className="p-3 bg-stone-50 rounded-xl sm:rounded-2xl mb-2 border border-stone-100">
                    <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">
                      Account Navigation
                    </p>
                    <p className="text-xs font-bold text-stone-700 mt-0.5">
                      Select a section to switch views
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <button
                      type="button"
                      onClick={() => handleTabChange("profile")}
                      className={cn(
                        "w-full flex items-center justify-between px-4 py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all text-left cursor-pointer",
                        activeTab === "profile"
                          ? "bg-stone-900 text-amber-400 shadow-md"
                          : "text-stone-700 hover:bg-stone-100 hover:text-stone-900"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <UserIcon className={cn("w-4 h-4", activeTab === "profile" ? "text-amber-400" : "text-stone-500")} />
                        <span>Profile</span>
                      </div>
                      {activeTab === "profile" && <CheckCircle className="w-4 h-4 text-amber-400" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleTabChange("settings")}
                      className={cn(
                        "w-full flex items-center justify-between px-4 py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all text-left cursor-pointer",
                        activeTab === "settings"
                          ? "bg-stone-900 text-amber-400 shadow-md"
                          : "text-stone-700 hover:bg-stone-100 hover:text-stone-900"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Camera className={cn("w-4 h-4", activeTab === "settings" ? "text-amber-400" : "text-stone-500")} />
                        <span>Settings</span>
                      </div>
                      {activeTab === "settings" && <CheckCircle className="w-4 h-4 text-amber-400" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleTabChange("kyc")}
                      className={cn(
                        "w-full flex items-center justify-between px-4 py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all text-left cursor-pointer",
                        activeTab === "kyc"
                          ? "bg-stone-900 text-amber-400 shadow-md"
                          : "text-stone-700 hover:bg-stone-100 hover:text-stone-900"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <FileCheck className={cn("w-4 h-4", activeTab === "kyc" ? "text-amber-400" : "text-stone-500")} />
                        <span>KYC Verification</span>
                      </div>
                      {activeTab === "kyc" && <CheckCircle className="w-4 h-4 text-amber-400" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleTabChange("trust")}
                      className={cn(
                        "w-full flex items-center justify-between px-4 py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all text-left cursor-pointer",
                        activeTab === "trust"
                          ? "bg-stone-900 text-amber-400 shadow-md"
                          : "text-stone-700 hover:bg-stone-100 hover:text-stone-900"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Shield className={cn("w-4 h-4", activeTab === "trust" ? "text-amber-400" : "text-stone-500")} />
                        <span>Trust Score Ledger</span>
                      </div>
                      {activeTab === "trust" && <CheckCircle className="w-4 h-4 text-amber-400" />}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {activeTab === "profile" && (
            <div className="space-y-8 animate-in fade-in duration-300">
              {/* Profile Header and unified presentation block */}
              <div className="bg-stone-50 rounded-[2rem] p-6 sm:p-8 border border-stone-100 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 blur-3xl rounded-full" />

                <div className="bg-white p-6 sm:p-8 rounded-2xl border border-stone-200 space-y-5 text-sm relative z-10 select-none">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 pb-2">
                    <div className="flex items-center gap-4">
                      {/* Avatar preview */}
                      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-stone-50 border-4 border-white shadow-xl overflow-hidden shrink-0 relative flex items-center justify-center">
                        {(!imgError && (profile?.photoURL || userProfile?.photoURL || user?.photoURL || formData.photoURL)) ? (
                          <img
                            src={profile?.photoURL || userProfile?.photoURL || user?.photoURL || formData.photoURL}
                            alt={profile?.name || user?.displayName || "Profile"}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                            onError={() => setImgError(true)}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-stone-200 bg-stone-100">
                            <UserIcon className="w-10 h-10" />
                          </div>
                        )}
                      </div>

                      {/* Name section with strict labels */}
                      <div>
                        <span className="text-stone-400 uppercase font-black text-xs tracking-widest block mb-0.5">
                          Name
                        </span>
                        <div 
                          id="profile-user-display-name-container"
                          className="relative inline-flex items-center px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-gradient-to-b from-stone-100 via-stone-200 to-stone-300 border-t-2 border-l border-r border-white border-b-2 border-b-stone-400 select-text"
                        >
                          <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/60 to-transparent rounded-t-lg pointer-events-none" />
                          <h1 
                            id="profile-user-display-name"
                            className="relative z-10 text-xl sm:text-2xl font-black text-stone-900 tracking-tight uppercase italic leading-none flex items-center gap-2"
                          >
                            <span>{profile?.name || "Anonymous User"}</span>
                            <ProfileVerificationTick profile={profile} userId={user?.uid} size="lg" />
                          </h1>
                        </div>
                        <p className="text-stone-400 font-bold text-xs mt-1 lowercase">
                          {profile?.email || user?.email}
                        </p>
                        <span className="text-stone-400 uppercase font-black text-xs tracking-widest block mt-3 mb-0.5">
                          Username
                        </span>
                        <p className="font-mono text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-100/50 inline-block">
                          @{profile?.username || 'seller'}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                      <button
                        onClick={handleShare}
                        title="Share Profile"
                        className="flex-none justify-center bg-stone-100 hover:bg-stone-200 text-stone-700 w-10 h-10 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center"
                      >
                        <Share2 className="w-4 h-4 text-stone-400" />
                      </button>
                      <Link
                        to={profile?.username ? `/user/${profile.username}` : `/user/${profile?.id || user?.uid}`}
                        className="flex-1 sm:flex-none justify-center bg-white border border-stone-200 text-stone-900 px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-stone-50 transition-all flex items-center gap-2"
                      >
                        <Eye className="w-3.5 h-3.5 text-amber-500" /> View Public Profile
                      </Link>
                      <Link
                        to="/sellr-dashboard"
                        className="flex-1 sm:flex-none justify-center bg-stone-900 text-white px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-stone-850 transition-all flex items-center gap-2"
                      >
                        <LayoutDashboard className="w-3.5 h-3.5 text-amber-500" /> Seller Hub
                      </Link>
                    </div>
                  </div>

                  {/* Battle Bids & Private Negotiations Credit Balance */}
                  <div className="flex items-center justify-between gap-3 pt-4 border-t border-stone-100 flex-wrap sm:flex-nowrap">
                    <div>
                      <span className="text-stone-400 uppercase font-black text-[10px] sm:text-xs tracking-widest block mb-1">
                        Battle Bids & Negotiation Credits
                      </span>
                      <p className="text-stone-500 text-xs">
                        Use credits to place bids in Battle Bids auctions or send private counter-offers.
                      </p>
                    </div>
                    <CreditBalanceBadge variant="full" className="shrink-0" />
                  </div>

                  {/* KYC Verification Status display */}
                  <div className="flex flex-col gap-2 border-t border-stone-100 pt-4">
                    <div className="flex items-center justify-between gap-2 font-black uppercase tracking-wider text-xs">
                      <span className="text-stone-500">KYC Verification:</span>
                      {profile?.kycStatus === "APPROVED" ? (
                        <span className="text-emerald-600 flex items-center gap-1.5">
                          ✓ KYC Approved
                        </span>
                      ) : profile?.kycStatus === "REVOKED" || kycApp?.status === "REVOKED" ? (
                        <span className="text-red-600 flex items-center gap-1.5 font-bold">
                          ⛔ KYC Revoked
                        </span>
                      ) : profile?.kycStatus === "RESUME_REQUESTED" || kycApp?.status === "RESUME_REQUESTED" ? (
                        <span className="text-blue-600 flex items-center gap-1.5 font-bold">
                          🔄 Appeal Pending
                        </span>
                      ) : profile?.kycStatus === "PENDING" || kycApp?.status === "PENDING" ? (
                        <span className="text-amber-600 flex items-center gap-1.5 font-bold">
                          ⏳ Under Review
                        </span>
                      ) : profile?.kycStatus === "REJECTED" || kycApp?.status === "REJECTED" ? (
                        <span className="text-stone-500 flex items-center gap-1.5 font-bold">
                          ❌ Rejected
                        </span>
                      ) : (
                        <span className="text-stone-400 flex items-center gap-1.5 font-bold">
                          Not Verified
                        </span>
                      )}
                    </div>

                    {/* Revocation & Appeal Section on Main Profile Tab */}
                    {(profile?.kycStatus === "REVOKED" || kycApp?.status === "REVOKED") && (
                      <div className="mt-2 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-900 space-y-3">
                        <div className="flex items-start gap-3">
                          <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                              <span className="font-black text-xs uppercase tracking-wider text-red-800">
                                KYC Status Revoked
                              </span>
                              {appealTimeRemaining && !isAppealTimeExpired && !isAppealRejected && (
                                <span className="text-[10px] font-bold px-2 py-0.5 bg-red-100 text-red-700 rounded-md border border-red-200">
                                  Appeal Deadline: {appealTimeRemaining}
                                </span>
                              )}
                            </div>
                            <p className="text-xs font-semibold text-red-700 leading-snug">
                              Reason: <strong className="italic font-bold">"{kycApp?.revocationReason || profile?.kycRevocationReason || "Policy violation indicator"}"</strong>
                            </p>
                            {isAppealRejected && (kycApp as any)?.appealRejectionReason && (
                              <p className="text-xs font-bold text-red-800 mt-2 p-2 bg-white/70 rounded-lg border border-red-200">
                                <span className="uppercase text-[10px] text-red-600 block mb-0.5 font-black">Latest Appeal Decision:</span>
                                {(kycApp as any).appealRejectionReason}
                              </p>
                            )}
                          </div>
                        </div>

                        {!isAppealTimeExpired && !isAppealRejected ? (
                          <div className="pt-2 border-t border-red-200/60 space-y-2">
                            <p className="text-[11px] font-bold text-stone-600">
                              You may file an appeal to compliance administrators within 24 hours of revocation:
                            </p>
                            <div className="flex flex-col sm:flex-row gap-2">
                              <input
                                type="text"
                                value={appealMessage}
                                onChange={(e) => setAppealMessage(e.target.value)}
                                placeholder="Explain why your verification should be restored..."
                                className="flex-grow bg-white border border-red-200 rounded-xl px-3 py-2 text-xs text-stone-900 font-bold focus:ring-2 focus:ring-red-400 outline-none"
                              />
                              <button
                                onClick={handleRequestResume}
                                disabled={kycSubmitting || !appealMessage.trim()}
                                className="shrink-0 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-stone-900 rounded-xl text-xs font-black uppercase tracking-wider transition shadow-sm"
                              >
                                Submit Appeal
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="pt-2 border-t border-red-200/60 flex flex-col sm:flex-row items-center justify-between gap-2">
                            <p className="text-xs font-bold text-red-700">
                              {isAppealRejected
                                ? "Appeal was declined. You may submit a fresh KYC application."
                                : "The 24-hour appeal window has expired. You may submit a fresh KYC application."}
                            </p>
                            <button
                              onClick={() => {
                                handleStartFreshKyc();
                                setActiveTab("kyc");
                              }}
                              className="shrink-0 px-4 py-1.5 bg-white hover:bg-stone-50 text-stone-900 border border-stone-300 rounded-xl text-xs font-black uppercase tracking-wider transition shadow-sm"
                            >
                              ✨ Submit Fresh Application
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* If Appeal is Pending (Resume Requested) */}
                    {(profile?.kycStatus === "RESUME_REQUESTED" || kycApp?.status === "RESUME_REQUESTED") && (
                      <div className="mt-2 p-4 bg-blue-50 border border-blue-200 rounded-2xl text-blue-900 flex items-start gap-3">
                        <Clock className="w-5 h-5 text-blue-600 shrink-0 mt-0.5 animate-pulse" />
                        <div>
                          <span className="font-black text-xs uppercase tracking-wider text-blue-800 block mb-0.5">
                            Appeal Pending
                          </span>
                          <p className="text-xs font-semibold text-blue-700 leading-snug">
                            Your reinstatement appeal has been received and is currently under compliance review. Duplicate submissions are not allowed while pending.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Premium Seller Status */}
                  <div className="flex items-center gap-2 font-black uppercase tracking-wider text-xs">
                    {profile && isSellerPremiumActive(profile) ? (
                      <span className="text-emerald-600 flex items-center gap-1.5">
                        ✓ Premium Seller
                      </span>
                    ) : (
                      <span className="text-red-500 flex items-center gap-1.5">
                        ❌ Premium Seller
                      </span>
                    )}
                  </div>

                  {/* Trust Score & Tier Badge */}
                  <div className="flex items-center justify-between pt-3 border-t border-stone-100">
                    <span className="text-stone-400 font-black uppercase tracking-wider text-xs">
                      Trust Score & Tier:
                    </span>
                    <TrustScoreBadge
                      trustScore={typeof profile?.trustScore === 'number' ? profile.trustScore : 50}
                      trustTier={profile?.trustTier}
                      size="sm"
                    />
                  </div>


                </div>
              </div>

              {/* Identity Details Card */}
              <div className="bg-white p-8 rounded-[2rem] border border-stone-100 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-5">
                  <UserIcon className="w-32 h-32" />
                </div>
                <h2 className="text-2xl font-black text-stone-900 uppercase italic tracking-tighter mb-8 border-b border-stone-50 pb-4 flex justify-between items-center">
                  Merchant Identity
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 relative z-10">
                  <div>
                    <span className="text-xs font-black text-stone-400 uppercase tracking-widest block mb-2">
                      Real Name (For Verification)
                    </span>
                    <p className="text-lg font-black text-stone-800 italic">
                      {profile?.realName || profile?.name || "-"}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs font-black text-stone-400 uppercase tracking-widest block mb-2">
                      Business Name (Public Profile)
                    </span>
                    <p className="text-lg font-black text-stone-800 italic">
                      {profile?.businessName || "Not Provided"}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs font-black text-stone-400 uppercase tracking-widest block mb-2">
                      Registered Phone
                    </span>
                    <p className="text-lg font-black text-stone-800 italic">
                      {profile?.phoneNumber || "-"}
                    </p>
                  </div>
                   <div>
                    <span className="text-xs font-black text-stone-400 uppercase tracking-widest block mb-2">
                      Country
                    </span>
                    <p className="text-lg font-black text-stone-800 italic flex items-center gap-2">
                      <span className="text-xl leading-none">{getCountryFlag(profile?.country)}</span>
                      <span>{profile?.country || "-"}</span>
                    </p>
                  </div>
                  <div>
                    <span className="text-xs font-black text-stone-400 uppercase tracking-widest block mb-2">
                      Operating City
                    </span>
                    <p className="text-lg font-black text-stone-800 italic">
                      {profile?.city || "-"}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs font-black text-stone-400 uppercase tracking-widest block mb-2">
                      Verified Address
                    </span>
                    <p className="text-lg font-black text-stone-800 italic">
                      {profile?.address || "-"}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setActiveTab("settings")}
                  className="mt-10 px-8 py-3 bg-stone-100 hover:bg-amber-500 hover:text-stone-900 text-stone-600 font-black rounded-xl text-xs uppercase tracking-widest transition-all active:scale-95"
                >
                  Update Identity Details
                </button>
              </div>

              {/* Verification Hub */}
              <div className="bg-stone-900 text-white p-6 sm:p-8 rounded-[2rem] shadow-xl relative overflow-hidden group">
                <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform duration-500">
                  <Shield className="w-32 h-32" />
                </div>
                <h3 className="text-xl font-black mb-6 uppercase italic tracking-tighter flex items-center gap-2.5 text-stone-100">
                  <ShieldCheck className="w-6 h-6 text-amber-500" /> Verification Hub
                </h3>
                <div className="space-y-4 relative z-10">
                  {/* 1. KYC STATUS */}
                  <div className="py-3 border-b border-stone-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-stone-400 text-xs font-black uppercase tracking-wider">
                        KYC Status:
                      </span>
                      {profile?.kycStatus === "APPROVED" ? (
                        <span className="text-emerald-400 font-black text-xs uppercase flex items-center gap-1.5 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                          <CheckCircle className="w-4 h-4" /> Approved
                        </span>
                      ) : (
                        <span className="text-red-400 font-black text-xs uppercase flex items-center gap-1.5 bg-red-500/10 px-3 py-1 rounded-full border border-red-500/20">
                          <XCircle className="w-4 h-4" /> Not Approved
                        </span>
                      )}
                    </div>
                    {!(profile?.kycStatus === "APPROVED") && (
                      <button
                        type="button"
                        onClick={() => setActiveTab("kyc")}
                        className="py-2 px-4 bg-stone-800 hover:bg-stone-750 text-amber-500 hover:text-amber-400 text-xs font-black uppercase tracking-widest rounded-xl transition-all border border-stone-700 active:scale-95 flex items-center justify-center gap-2"
                      >
                        Request KYC
                      </button>
                    )}
                  </div>

                  {/* 2. PREMIUM SELLER STATUS */}
                  <div className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 font-sans">
                    <div className="flex items-center gap-3">
                      <span className="text-stone-400 text-xs font-black uppercase tracking-wider block">
                        Premium Badge:
                      </span>
                      {isBadgeActive ? (
                        <span className="text-amber-400 font-black text-xs uppercase flex items-center gap-1.5 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
                          <CheckCircle className="w-4 h-4 text-amber-500" /> Active
                        </span>
                      ) : (
                        <span className="text-stone-400 font-black text-xs uppercase flex items-center gap-1.5 bg-stone-500/10 px-3 py-1 rounded-full border border-stone-500/20">
                          <XCircle className="w-4 h-4" /> Not Active
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      id="premium-verified-btn"
                      onClick={() => navigate("/premium")}
                      className={`py-2 px-4 text-xs font-black uppercase tracking-widest rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 ${
                        isBadgeActive 
                          ? "bg-amber-500 hover:bg-amber-600 text-stone-900 shadow-sm" 
                          : "bg-amber-500 hover:bg-amber-600 text-stone-900"
                      }`}
                    >
                      {isBadgeActive ? "View Badge Details" : "Apply Badge"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Boasters Section */}
              <div id="boasters-section" className="bg-stone-900 p-6 sm:p-8 rounded-[2rem] border border-stone-800 shadow-xl relative overflow-hidden animate-in fade-in duration-350">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-black text-white uppercase italic tracking-tighter flex items-center gap-2.5">
                    <Rocket className="w-6 h-6 text-amber-500" /> Boosters
                  </h3>
                  <p className="text-stone-400 font-black uppercase tracking-widest text-xs hidden md:block">
                    Boost visibility instantly
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-white">
                  {/* Featured Ad Badge Button */}
                  <Link
                    id="btn-featured-ad-badge"
                    to="/featured"
                    className="flex items-center justify-between p-4 bg-stone-950 hover:bg-amber-500/10 border border-stone-800 hover:border-amber-500/30 rounded-2xl group transition-all duration-350 cursor-pointer text-left no-underline gap-4 animate-in fade-in"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-2.5 bg-stone-800 text-amber-500 rounded-xl group-hover:bg-amber-500 group-hover:text-stone-900 transition-colors shrink-0 shadow-sm">
                        <Zap className="w-5 h-5 fill-amber-500/10 group-hover:fill-transparent" />
                      </div>
                      <div>
                        <h4 className="font-black text-white uppercase tracking-tight text-xs">
                          Featured Ad Badge
                        </h4>
                        <p className="text-xs text-stone-400 mt-0.5 leading-snug">
                          Position ads at the top.
                        </p>
                      </div>
                    </div>
                    <span className="p-1 text-stone-600 group-hover:text-amber-500 group-hover:translate-x-1 transition-transform shrink-0">
                      →
                    </span>
                  </Link>

                  {/* Boosted Ads Badge Button */}
                  <Link
                    id="btn-boosted-ads-badge"
                    to="/boosts"
                    className="flex items-center justify-between p-4 bg-stone-950 hover:bg-amber-500/10 border border-stone-800 hover:border-amber-500/30 rounded-2xl group transition-all duration-350 cursor-pointer text-left no-underline gap-4 animate-in fade-in"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-2.5 bg-stone-800 text-amber-500 rounded-xl group-hover:bg-amber-500 group-hover:text-stone-900 transition-colors shrink-0 shadow-sm">
                        <Rocket className="w-5 h-5 fill-amber-500/10 group-hover:fill-transparent" />
                      </div>
                      <div>
                        <h4 className="font-black text-white uppercase tracking-tight text-xs">
                          Boosted Ads Badge
                        </h4>
                        <p className="text-xs text-stone-400 mt-0.5 leading-snug">
                          Elevate rankings instantly.
                        </p>
                      </div>
                    </div>
                    <span className="p-1 text-stone-600 group-hover:text-amber-500 group-hover:translate-x-1 transition-transform shrink-0">
                      →
                    </span>
                  </Link>
                </div>
              </div>

              {/* My Listings Section */}
              <div id="my-listings-section" className="bg-white p-6 sm:p-8 rounded-[2rem] border border-stone-100 shadow-sm relative overflow-hidden animate-in fade-in duration-300">
                <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 blur-3xl rounded-full pointer-events-none" />
                
                <div className="flex items-center justify-between mb-6 gap-3 relative z-10">
                  <div>
                    <h3 className="text-lg sm:text-2xl font-black text-stone-900 uppercase italic tracking-tighter flex items-center gap-2 sm:gap-2.5">
                      <Store className="w-5 h-5 sm:w-6 sm:h-6 text-amber-500 shrink-0" /> My Listings
                    </h3>
                    <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 sm:mt-1">
                      <span className="h-0.5 w-6 sm:w-8 bg-stone-900 rounded-full" />
                      <span className="text-[10px] sm:text-[11px] font-black text-stone-400 uppercase tracking-widest">
                        {unifiedListings.length} {unifiedListings.length === 1 ? 'item' : 'items'}
                      </span>
                    </div>
                  </div>

                  {unifiedListings.length > 0 && (
                    <div className="flex items-center gap-2 shrink-0">
                      {!isExploreMyListings ? (
                        <button
                          type="button"
                          onClick={() => setIsExploreMyListings(true)}
                          className="bg-amber-500 hover:bg-amber-400 text-stone-950 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer shrink-0"
                        >
                          <Compass className="w-4 h-4 stroke-[2.5]" />
                          <span>Explore</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setIsExploreMyListings(false);
                            setMyListingsSearchTerm('');
                            setMyListingsCategoryFilter('ALL');
                          }}
                          className="bg-stone-900 hover:bg-stone-800 text-white px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer shrink-0"
                        >
                          <ChevronLeft className="w-4 h-4 text-amber-400" />
                          <span>Single Row</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {unifiedListings.length === 0 ? (
                  <div className="py-12 px-6 text-center space-y-6 max-w-lg mx-auto bg-stone-50 rounded-2xl border border-stone-150 relative z-10">
                    <div className="w-16 h-16 bg-stone-200/50 rounded-full flex items-center justify-center text-stone-500 mx-auto">
                      <Package className="w-8 h-8 text-stone-400" />
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-sm font-black text-stone-800 uppercase tracking-wider">No Active Listings</h4>
                      <p className="text-xs text-stone-500 font-medium leading-relaxed max-w-md mx-auto">
                        You have not posted any listings yet. Create a standard marketplace ad, set up a battle bids arena auction, or start a private negotiation to view your items here.
                      </p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                      <button
                        type="button"
                        onClick={() => navigate("/submit")}
                        className="py-2 px-4 bg-stone-900 hover:bg-amber-500 hover:text-stone-900 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all active:scale-95 shadow-sm"
                      >
                        Post Standard Ad
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate("/battle-bids/create")}
                        className="py-2 px-4 bg-white hover:bg-stone-50 text-stone-900 border border-stone-200 font-black text-xs uppercase tracking-widest rounded-xl transition-all active:scale-95 shadow-xs"
                      >
                        Launch Auction
                      </button>
                    </div>
                  </div>
                ) : !isExploreMyListings ? (
                  <div className="relative z-10 group/row">
                    {/* Left Scroll Button */}
                    <button 
                      type="button"
                      onClick={() => handleProfileListingsScroll('left')}
                      className="absolute -left-2 sm:-left-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white/95 border-2 border-stone-200 hover:border-amber-500 shadow-xl flex items-center justify-center text-stone-700 hover:text-amber-600 hover:bg-stone-50 transition-all active:scale-95 cursor-pointer"
                      aria-label="Scroll Left"
                    >
                      <ChevronLeft className="w-5 h-5 font-black" />
                    </button>

                    {/* Single Row Swipeable Container */}
                    <div 
                      ref={profileListingsScrollRef}
                      className="flex gap-4 sm:gap-5 overflow-x-auto pb-6 pt-1 px-1 scroll-smooth snap-x snap-mandatory scrollbar-thin [scrollbar-width:thin] select-none"
                    >
                      {unifiedListings.map((item) => (
                        <div
                          key={`${item.type}-${item.id}`}
                          onClick={() => navigate(item.exploreUrl)}
                          className="w-[250px] sm:w-[280px] shrink-0 bg-stone-50 border border-stone-150 hover:border-amber-500/40 rounded-[1.5rem] p-4 flex flex-col justify-between snap-start hover:shadow-md transition-all duration-300 group/card text-left cursor-pointer"
                        >
                          {/* Image box with Zoom */}
                          <div className="relative h-44 w-full bg-stone-200 rounded-xl overflow-hidden mb-3 group/img">
                            {/* Category/Hub Badge */}
                            <span className={`absolute top-3 left-3 z-10 text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full shadow-xs ${
                              item.type === 'marketplace' 
                                ? 'bg-blue-600 text-white border border-blue-500' 
                                : item.type === 'arena' 
                                  ? 'bg-amber-500 text-stone-950 border border-amber-400' 
                                  : 'bg-rose-600 text-white border border-rose-500'
                            }`}>
                              {item.categoryName}
                            </span>

                            {/* Hover/Tap to zoom overlay */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setZoomedImage(item.image);
                                setLightboxImages(item.images);
                                setLightboxTitle(item.title);
                              }}
                              className="absolute top-3 right-3 z-10 p-2 bg-white/90 hover:bg-white text-stone-900 rounded-full shadow-md backdrop-blur-sm transition-all hover:scale-110 active:scale-95"
                              title="Zoom/Expand image"
                            >
                              <ZoomIn className="w-4 h-4" />
                            </button>

                            {/* Product Image */}
                            <img
                              src={item.image}
                              alt={item.title}
                              className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-105"
                              referrerPolicy="no-referrer"
                            />
                          </div>

                          {/* Details */}
                          <div>
                            <h4 className="font-black text-stone-900 uppercase tracking-tight text-xs sm:text-sm line-clamp-1 group-hover/card:text-amber-600 transition-colors">
                              {item.title}
                            </h4>
                            <p className="text-xs text-stone-500 font-bold mt-1">
                              {item.priceText}
                            </p>
                          </div>
                        </div>
                      ))}

                      {/* Explore Card at the end of row */}
                      <div 
                        onClick={() => setIsExploreMyListings(true)}
                        className="w-[200px] shrink-0 bg-stone-950 text-white rounded-[1.5rem] p-5 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-amber-500 hover:text-stone-950 transition-all border border-stone-800 shadow-lg group/explorecard snap-start my-0.5"
                      >
                        <div className="w-11 h-11 rounded-full bg-stone-800 group-hover/explorecard:bg-stone-950/20 flex items-center justify-center mb-2.5 transition-colors">
                          <Compass className="w-5 h-5 text-amber-400 group-hover/explorecard:text-stone-950 transition-colors" />
                        </div>
                        <span className="font-black text-xs sm:text-sm uppercase italic tracking-wider leading-tight mb-1">Explore</span>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400 group-hover/explorecard:text-stone-900 transition-colors">
                          {unifiedListings.length} {unifiedListings.length === 1 ? 'item' : 'items'}
                        </span>
                        <div className="mt-3.5 px-3 py-1.5 bg-amber-500 group-hover/explorecard:bg-stone-950 text-stone-950 group-hover/explorecard:text-white rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                          <span>Open View</span>
                          <ArrowRight className="w-3 h-3" />
                        </div>
                      </div>
                    </div>

                    {/* Right Scroll Button */}
                    <button 
                      type="button"
                      onClick={() => handleProfileListingsScroll('right')}
                      className="absolute -right-2 sm:-right-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white/95 border-2 border-stone-200 hover:border-amber-500 shadow-xl flex items-center justify-center text-stone-700 hover:text-amber-600 hover:bg-stone-50 transition-all active:scale-95 cursor-pointer"
                      aria-label="Scroll Right"
                    >
                      <ChevronRight className="w-5 h-5 font-black" />
                    </button>

                    {/* Swipe indicator */}
                    <div className="flex justify-between items-center text-stone-400 font-bold uppercase tracking-wider text-[10px] mt-2 select-none">
                      <span>Swipe left / right or use arrows ↔</span>
                      <span>Total: {unifiedListings.length} Listed Items</span>
                    </div>
                  </div>
                ) : (
                  /* IN-PAGE EXPLORE GRID VIEW FOR MY LISTINGS */
                  <div className="space-y-6 animate-in fade-in duration-300 relative z-10">
                    <div className="bg-stone-900 text-white p-5 sm:p-8 rounded-2xl sm:rounded-[2rem] shadow-xl border border-stone-800 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 blur-[80px] rounded-full pointer-events-none" />
                      
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-amber-500 text-stone-950 rounded-2xl shrink-0 shadow-lg shadow-amber-500/20">
                            <Compass className="w-6 h-6 stroke-[2.5]" />
                          </div>
                          <div>
                            <h3 className="text-xl sm:text-3xl font-black uppercase italic tracking-tight text-white leading-none">
                              Explore <span className="text-amber-500">My Listings</span>
                            </h3>
                            <p className="text-xs font-bold text-stone-400 uppercase tracking-widest mt-1">
                              All items listed under your profile • Click any item to open details
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setIsExploreMyListings(false);
                            setMyListingsSearchTerm('');
                            setMyListingsCategoryFilter('ALL');
                          }}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-stone-800 hover:bg-amber-500 hover:text-stone-950 text-stone-300 rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 cursor-pointer border border-stone-700 shrink-0 self-start sm:self-auto"
                        >
                          <ChevronLeft className="w-4 h-4" />
                          <span>Return to Single Row View</span>
                        </button>
                      </div>

                      {/* Search & Category Filter bar */}
                      <div className="mt-6 pt-5 border-t border-stone-800 flex flex-col sm:flex-row gap-4 items-center justify-between relative z-10">
                        <div className="relative w-full sm:w-72">
                          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                          <input 
                            type="text" 
                            value={myListingsSearchTerm}
                            onChange={(e) => setMyListingsSearchTerm(e.target.value)}
                            placeholder="Search my listings..." 
                            className="w-full pl-10 pr-8 py-2 bg-stone-800 border border-stone-700 rounded-xl text-xs font-bold text-white placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                          />
                          {myListingsSearchTerm && (
                            <button onClick={() => setMyListingsSearchTerm('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-white">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-1.5 w-full sm:w-auto">
                          {[
                            { id: 'ALL', label: 'All', count: unifiedListings.length },
                            { id: 'marketplace', label: 'Standard Ads', count: unifiedListings.filter(i => i.type === 'marketplace').length },
                            { id: 'arena', label: 'Arena Auctions', count: unifiedListings.filter(i => i.type === 'arena').length },
                            { id: 'negotiation', label: 'Private Offers', count: unifiedListings.filter(i => i.type === 'negotiation').length },
                          ].map(cat => (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => setMyListingsCategoryFilter(cat.id as any)}
                              className={`px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                myListingsCategoryFilter === cat.id
                                  ? 'bg-amber-500 text-stone-950 shadow-md shadow-amber-500/20'
                                  : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                              }`}
                            >
                              {cat.label} ({cat.count})
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {filteredUnifiedListings.length === 0 ? (
                      <div className="py-16 text-center bg-stone-50 rounded-2xl border border-stone-200 border-dashed">
                        <Package className="w-12 h-12 text-stone-300 mx-auto mb-3" />
                        <p className="text-xs font-black text-stone-500 uppercase tracking-wider">No listings matched your filter criteria</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
                        {filteredUnifiedListings.map((item) => (
                          <div
                            key={`${item.type}-${item.id}`}
                            className="bg-white border border-stone-150 hover:border-amber-500/40 rounded-[1.5rem] p-4 flex flex-col justify-between hover:shadow-xl transition-all duration-300 group/card text-left"
                          >
                            <div className="relative h-44 w-full bg-stone-100 rounded-xl overflow-hidden mb-4 group/img">
                              <span className={`absolute top-3 left-3 z-10 text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full shadow-xs ${
                                item.type === 'marketplace' 
                                  ? 'bg-blue-600 text-white border border-blue-500' 
                                  : item.type === 'arena' 
                                    ? 'bg-amber-500 text-stone-950 border border-amber-400' 
                                    : 'bg-rose-600 text-white border border-rose-500'
                              }`}>
                                {item.categoryName}
                              </span>

                              <button
                                type="button"
                                onClick={() => {
                                  setZoomedImage(item.image);
                                  setLightboxImages(item.images);
                                  setLightboxTitle(item.title);
                                }}
                                className="absolute top-3 right-3 z-10 p-2 bg-white/90 hover:bg-white text-stone-900 rounded-full shadow-md backdrop-blur-sm transition-all hover:scale-110 active:scale-95"
                                title="Zoom image"
                              >
                                <ZoomIn className="w-4 h-4" />
                              </button>

                              <img
                                src={item.image}
                                alt={item.title}
                                className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-105"
                                referrerPolicy="no-referrer"
                              />
                            </div>

                            <div className="flex-1 flex flex-col justify-between space-y-4">
                              <div>
                                <h4 className="font-black text-stone-900 uppercase tracking-tight text-xs sm:text-sm line-clamp-1 group-hover/card:text-amber-600 transition-colors">
                                  {item.title}
                                </h4>
                                <p className="text-xs text-stone-500 font-bold mt-1">
                                  {item.priceText}
                                </p>
                              </div>

                              <button
                                type="button"
                                onClick={() => navigate(item.exploreUrl)}
                                className="w-full py-2.5 px-4 bg-stone-900 hover:bg-amber-500 hover:text-stone-900 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all active:scale-95 text-center flex items-center justify-center gap-1.5 shadow-sm"
                              >
                                <span>Open Listing</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex justify-center pt-4">
                      <button
                        type="button"
                        onClick={() => {
                          setIsExploreMyListings(false);
                          setMyListingsSearchTerm('');
                          setMyListingsCategoryFilter('ALL');
                        }}
                        className="px-6 py-3 bg-stone-900 hover:bg-stone-800 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg flex items-center gap-2 active:scale-95 transition-all cursor-pointer"
                      >
                        <ChevronLeft className="w-4 h-4 text-amber-400" />
                        <span>Return to Single Row View</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

      {activeTab === "settings" && (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-300">
          <div className="bg-white p-6 sm:p-10 rounded-[2.5rem] border border-stone-100 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 blur-3xl rounded-full pointer-events-none" />
            
            <h2 className="text-2xl sm:text-3xl font-black text-stone-900 mb-8 uppercase italic tracking-tighter flex items-center gap-3 relative z-10">
              <UserIcon className="w-8 h-8 text-amber-500" /> Account Settings & Profile
            </h2>

            <form onSubmit={handleSave} className="space-y-10 relative z-10">
              {/* Profile Photo Upload */}
              <div className="flex flex-col sm:flex-row items-center gap-6 pb-8 border-b border-stone-100">
                <div className="relative w-24 h-24 rounded-full bg-stone-50 border-4 border-stone-100 shadow-md overflow-hidden shrink-0 group flex items-center justify-center">
                  {(formData.photoURL || profile?.photoURL || userProfile?.photoURL || user?.photoURL) ? (
                    <img
                      src={formData.photoURL || profile?.photoURL || userProfile?.photoURL || user?.photoURL}
                      alt="Avatar Preview"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-stone-300 bg-stone-50">
                      <UserIcon className="w-10 h-10" />
                    </div>
                  )}
                  <label className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                    <Camera className="w-6 h-6 text-white" />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                  </label>
                </div>
                <div className="text-center sm:text-left">
                  <p className="text-sm font-black text-stone-850 uppercase tracking-wider">Profile Photo</p>
                  <p className="text-xs text-stone-400 mt-1">Upload a real face or business logo for better trust. Max 2MB.</p>
                  <label className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-black uppercase tracking-widest cursor-pointer transition-all">
                    <Upload className="w-3.5 h-3.5 text-stone-500" />
                    Choose Image
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Individual / Business Section Switcher with Mutual Exclusivity and Active/Inactive Status */}
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row gap-3 p-2 bg-stone-100 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => setSettingsSection("INDIVIDUAL")}
                    className={`flex-1 py-4 px-5 rounded-xl font-black text-xs uppercase tracking-widest transition-all cursor-pointer flex items-center justify-between ${
                      settingsSection === "INDIVIDUAL"
                        ? "bg-stone-900 text-white shadow-md"
                        : "text-stone-600 hover:text-stone-900 bg-white/50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <UserIcon className="w-4 h-4 text-amber-500" /> Individual Settings
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${
                      settingsSection === "INDIVIDUAL" ? "bg-emerald-500 text-stone-950" : "bg-stone-200 text-stone-500"
                    }`}>
                      {settingsSection === "INDIVIDUAL" ? "ACTIVE" : "INACTIVE"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettingsSection("BUSINESS")}
                    className={`flex-1 py-4 px-5 rounded-xl font-black text-xs uppercase tracking-widest transition-all cursor-pointer flex items-center justify-between ${
                      settingsSection === "BUSINESS"
                        ? "bg-stone-900 text-white shadow-md"
                        : "text-stone-600 hover:text-stone-900 bg-white/50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Store className="w-4 h-4 text-amber-500" /> Business Settings
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${
                      settingsSection === "BUSINESS" ? "bg-emerald-500 text-stone-950" : "bg-stone-200 text-stone-500"
                    }`}>
                      {settingsSection === "BUSINESS" ? "ACTIVE" : "INACTIVE"}
                    </span>
                  </button>
                </div>

                {settingsSection === "BUSINESS" && (
                  <div className="bg-amber-50 border border-amber-200/60 p-4 rounded-2xl text-xs font-semibold text-amber-900 flex items-start gap-3">
                    <Store className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-black uppercase tracking-wider text-amber-950">Business Account Mode Active</p>
                      <p className="mt-1 text-amber-800">
                        Entering your business name will automatically make it your public profile name. Individual account is currently inactive.
                      </p>
                    </div>
                  </div>
                )}
                {settingsSection === "INDIVIDUAL" && (
                  <div className="bg-stone-50 border border-stone-200/60 p-4 rounded-2xl text-xs font-semibold text-stone-700 flex items-start gap-3">
                    <UserIcon className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-black uppercase tracking-wider text-stone-900">Individual Account Mode Active</p>
                      <p className="mt-1 text-stone-600">
                        Managing personal individual credentials. Business account is currently inactive.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {settingsSection === "INDIVIDUAL" ? (
                /* Individual Settings Section */
                <div className="space-y-8 animate-in fade-in duration-200">
                  <div className="space-y-6">
                    <h3 className="text-xs font-black text-stone-400 uppercase tracking-[0.3em] border-b border-stone-50 pb-2">
                      Individual Profile Details
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="group">
                        <label className="block text-xs font-black text-stone-400 uppercase tracking-widest mb-2 group-focus-within:text-amber-600 transition-colors">
                          Username <span className="text-amber-600">*</span>
                        </label>
                        <div className="flex items-center gap-2">
                          <p className="flex-1 bg-stone-50 border border-stone-200 rounded-2xl p-4 text-sm font-bold text-stone-900 italic flex items-center">
                            @{profile?.username || "seller"}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setNewUsernameInput(profile?.username || "");
                              setShowUsernameModal(true);
                            }}
                            className="px-4 py-4 bg-stone-100 hover:bg-stone-200 text-stone-600 font-black text-xs uppercase tracking-widest rounded-2xl transition-all h-full whitespace-nowrap cursor-pointer"
                          >
                            Change
                          </button>
                        </div>
                      </div>

                      <div className="group">
                        <label className="block text-xs font-black text-stone-400 uppercase tracking-widest mb-2 group-focus-within:text-amber-600 transition-colors">
                          Real Name (Public Profile Name) <span className="text-amber-600">*</span>
                        </label>
                        <input
                          type="text"
                          name="name"
                          value={formData.name || ""}
                          onChange={handleChange}
                          className="w-full bg-stone-50 border border-stone-200 focus:border-amber-500 rounded-2xl p-4 text-sm font-bold text-stone-900 focus:ring-2 focus:ring-amber-500/20 italic"
                          placeholder="e.g. Ali Ahmed"
                          required
                        />
                      </div>

                      <div className="group">
                        <label className="block text-xs font-black text-stone-400 uppercase tracking-widest mb-2 group-focus-within:text-amber-600 transition-colors">
                          Phone Number <span className="text-amber-600">*</span>
                        </label>
                        <PhoneInput
                          value={formData.phoneNumber || ""}
                          onChange={(val) => setFormData(prev => ({ ...prev, phoneNumber: val }))}
                          placeholder="e.g. 300 1234567"
                        />
                      </div>

                      <div className="group">
                        <label className="block text-xs font-black text-stone-400 uppercase tracking-widest mb-2 group-focus-within:text-amber-600 transition-colors">
                          Country <span className="text-amber-600">*</span>
                        </label>
                        <CountrySelector
                          id="profile-origin-country"
                          value={formData.country || ""}
                          onChange={(val) => setFormData(prev => ({ ...prev, country: val, countryOfStay: val }))}
                          placeholder="Select Country"
                        />
                      </div>

                      <div className="group">
                        <label className="block text-xs font-black text-stone-400 uppercase tracking-widest mb-2 group-focus-within:text-amber-600 transition-colors">
                          Residential City <span className="text-amber-600">*</span>
                        </label>
                        <input
                          type="text"
                          name="city"
                          value={formData.city || ""}
                          onChange={handleChange}
                          className="w-full bg-stone-50 border border-stone-200 focus:border-amber-500 rounded-2xl p-4 text-sm font-bold text-stone-900 focus:ring-2 focus:ring-amber-500/20 italic"
                          placeholder="e.g. Sargodha"
                          required
                        />
                      </div>

                      <div className="group">
                        <label className="block text-xs font-black text-stone-400 uppercase tracking-widest mb-2 group-focus-within:text-amber-600 transition-colors">
                          National Identity Card/ Government Issue Document Number
                        </label>
                        <input
                          type="text"
                          name="cnicNumber"
                          value={formData.cnicNumber || ""}
                          onChange={handleChange}
                          className="w-full bg-stone-50 border border-stone-200 focus:border-amber-500 rounded-2xl p-4 text-sm font-bold text-stone-900 focus:ring-2 focus:ring-amber-500/20 italic"
                          placeholder="CNIC / ID number"
                        />
                      </div>

                      <div className="group md:col-span-2">
                        <label className="block text-xs font-black text-stone-400 uppercase tracking-widest mb-2 group-focus-within:text-amber-600 transition-colors">
                          Residential Address <span className="text-amber-600">*</span>
                        </label>
                        <input
                          type="text"
                          name="residentialAddress"
                          value={formData.residentialAddress || ""}
                          onChange={handleChange}
                          className="w-full bg-stone-50 border border-stone-200 focus:border-amber-500 rounded-2xl p-4 text-sm font-bold text-stone-900 focus:ring-2 focus:ring-amber-500/20 italic"
                          placeholder="Full residential address"
                          required
                        />
                      </div>

                      <div className="group md:col-span-2">
                        <label className="block text-xs font-black text-stone-400 uppercase tracking-widest mb-2 group-focus-within:text-amber-600 transition-colors">
                          Bio
                        </label>
                        <textarea
                          name="bio"
                          value={formData.bio || ""}
                          onChange={handleChange}
                          rows={3}
                          className="w-full bg-stone-50 border border-stone-200 focus:border-amber-500 rounded-2xl p-4 text-sm font-bold text-stone-900 focus:ring-2 focus:ring-amber-500/20 italic"
                          placeholder="Write a brief introduction about yourself..."
                        />
                      </div>
                    </div>
                  </div>

                  {/* Individual Social Links */}
                  <div className="space-y-6 pt-6 border-t border-stone-100">
                    <h3 className="text-xs font-black text-stone-400 uppercase tracking-[0.3em] border-b border-stone-50 pb-2">
                      Social & Professional Links
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="group">
                        <label className="block text-xs font-black text-stone-400 uppercase tracking-widest mb-2 group-focus-within:text-amber-600 transition-colors">
                          Website URL
                        </label>
                        <div className="relative">
                          <Globe className="w-4 h-4 text-stone-400 absolute left-4 top-1/2 -translate-y-1/2" />
                          <input
                            type="url"
                            name="websiteUrl"
                            value={formData.websiteUrl || ""}
                            onChange={handleChange}
                            className="w-full bg-stone-50 border border-stone-200 focus:border-amber-500 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold text-stone-900 focus:ring-2 focus:ring-amber-500/20 italic"
                            placeholder="https://example.com"
                          />
                        </div>
                      </div>

                      <div className="group">
                        <label className="block text-xs font-black text-stone-400 uppercase tracking-widest mb-2 group-focus-within:text-amber-600 transition-colors">
                          Facebook Page / Profile
                        </label>
                        <input
                          type="text"
                          name="facebookPage"
                          value={formData.facebookPage || ""}
                          onChange={handleChange}
                          className="w-full bg-stone-50 border border-stone-200 focus:border-amber-500 rounded-2xl p-4 text-sm font-bold text-stone-900 focus:ring-2 focus:ring-amber-500/20 italic"
                          placeholder="Facebook link or profile name"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Business Settings Section */
                <div className="space-y-8 animate-in fade-in duration-200">
                  <div className="space-y-6">
                    <h3 className="text-xs font-black text-stone-400 uppercase tracking-[0.3em] border-b border-stone-50 pb-2">
                      Business Profile Details
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="group">
                        <label className="block text-xs font-black text-stone-400 uppercase tracking-widest mb-2 group-focus-within:text-amber-600 transition-colors">
                          Username <span className="text-amber-600">*</span>
                        </label>
                        <div className="flex items-center gap-2">
                          <p className="flex-1 bg-stone-50 border border-stone-200 rounded-2xl p-4 text-sm font-bold text-stone-900 italic flex items-center">
                            @{profile?.username || "seller"}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setNewUsernameInput(profile?.username || "");
                              setShowUsernameModal(true);
                            }}
                            className="px-4 py-4 bg-stone-100 hover:bg-stone-200 text-stone-600 font-black text-xs uppercase tracking-widest rounded-2xl transition-all h-full whitespace-nowrap cursor-pointer"
                          >
                            Change
                          </button>
                        </div>
                      </div>

                      <div className="group">
                        <label className="block text-xs font-black text-stone-400 uppercase tracking-widest mb-2 group-focus-within:text-amber-600 transition-colors">
                          Real Name <span className="text-amber-600">*</span>
                        </label>
                        <input
                          type="text"
                          name="realName"
                          value={formData.realName || ""}
                          onChange={handleChange}
                          className="w-full bg-stone-50 border border-stone-200 focus:border-amber-500 rounded-2xl p-4 text-sm font-bold text-stone-900 focus:ring-2 focus:ring-amber-500/20 italic"
                          placeholder="Full legal owner name"
                          required={settingsSection === "BUSINESS"}
                        />
                      </div>

                      <div className="group md:col-span-2">
                        <label className="block text-xs font-black text-stone-400 uppercase tracking-widest mb-2 group-focus-within:text-amber-600 transition-colors">
                          Business Name (Public Profile Name) <span className="text-amber-600">*</span>
                        </label>
                        <input
                          type="text"
                          name="businessName"
                          value={formData.businessName || ""}
                          onChange={handleChange}
                          className="w-full bg-stone-50 border border-stone-200 focus:border-amber-500 rounded-2xl p-4 text-sm font-bold text-stone-900 focus:ring-2 focus:ring-amber-500/20 italic"
                          placeholder="e.g. Sargodha Citrus Farm & Orchards"
                          required={settingsSection === "BUSINESS"}
                        />
                      </div>

                      <div className="group">
                        <label className="block text-xs font-black text-stone-400 uppercase tracking-widest mb-2 group-focus-within:text-amber-600 transition-colors">
                          Country <span className="text-amber-600">*</span>
                        </label>
                        <CountrySelector
                          id="profile-business-country"
                          value={formData.country || ""}
                          onChange={(val) => setFormData(prev => ({ ...prev, country: val, countryOfStay: val }))}
                          placeholder="Select Country"
                        />
                      </div>

                      <div className="group">
                        <label className="block text-xs font-black text-stone-400 uppercase tracking-widest mb-2 group-focus-within:text-amber-600 transition-colors">
                          Phone Number <span className="text-amber-600">*</span>
                        </label>
                        <PhoneInput
                          value={formData.phoneNumber || ""}
                          onChange={(val) => setFormData(prev => ({ ...prev, phoneNumber: val }))}
                          placeholder="e.g. 300 1234567"
                        />
                      </div>

                      <div className="group">
                        <label className="block text-xs font-black text-stone-400 uppercase tracking-widest mb-2 group-focus-within:text-amber-600 transition-colors">
                          Residential City <span className="text-amber-600">*</span>
                        </label>
                        <input
                          type="text"
                          name="city"
                          value={formData.city || ""}
                          onChange={handleChange}
                          className="w-full bg-stone-50 border border-stone-200 focus:border-amber-500 rounded-2xl p-4 text-sm font-bold text-stone-900 focus:ring-2 focus:ring-amber-500/20 italic"
                          placeholder="e.g. Sargodha"
                          required={settingsSection === "BUSINESS"}
                        />
                      </div>

                      <div className="group">
                        <label className="block text-xs font-black text-stone-400 uppercase tracking-widest mb-2 group-focus-within:text-amber-600 transition-colors">
                          Business Operating City <span className="text-amber-600">*</span>
                        </label>
                        <input
                          type="text"
                          name="businessCity"
                          value={formData.businessCity || ""}
                          onChange={handleChange}
                          className="w-full bg-stone-50 border border-stone-200 focus:border-amber-500 rounded-2xl p-4 text-sm font-bold text-stone-900 focus:ring-2 focus:ring-amber-500/20 italic"
                          placeholder="e.g. Lahore / Wholesale Market"
                          required={settingsSection === "BUSINESS"}
                        />
                      </div>

                      <div className="group md:col-span-2">
                        <label className="block text-xs font-black text-stone-400 uppercase tracking-widest mb-2 group-focus-within:text-amber-600 transition-colors">
                          Residential Address <span className="text-amber-600">*</span>
                        </label>
                        <input
                          type="text"
                          name="residentialAddress"
                          value={formData.residentialAddress || ""}
                          onChange={handleChange}
                          className="w-full bg-stone-50 border border-stone-200 focus:border-amber-500 rounded-2xl p-4 text-sm font-bold text-stone-900 focus:ring-2 focus:ring-amber-500/20 italic"
                          placeholder="Full residential address"
                          required={settingsSection === "BUSINESS"}
                        />
                      </div>

                      <div className="group md:col-span-2">
                        <label className="block text-xs font-black text-stone-400 uppercase tracking-widest mb-2 group-focus-within:text-amber-600 transition-colors">
                          Business Operating Address <span className="text-amber-600">*</span>
                        </label>
                        <input
                          type="text"
                          name="businessAddress"
                          value={formData.businessAddress || ""}
                          onChange={handleChange}
                          className="w-full bg-stone-50 border border-stone-200 focus:border-amber-500 rounded-2xl p-4 text-sm font-bold text-stone-900 focus:ring-2 focus:ring-amber-500/20 italic"
                          placeholder="Full corporate / business operating address"
                          required={settingsSection === "BUSINESS"}
                        />
                      </div>

                      <div className="group">
                        <label className="block text-xs font-black text-stone-400 uppercase tracking-widest mb-2 group-focus-within:text-amber-600 transition-colors">
                          National Identity Card/ Government Issue Document Number
                        </label>
                        <input
                          type="text"
                          name="cnicNumber"
                          value={formData.cnicNumber || ""}
                          onChange={handleChange}
                          className="w-full bg-stone-50 border border-stone-200 focus:border-amber-500 rounded-2xl p-4 text-sm font-bold text-stone-900 focus:ring-2 focus:ring-amber-500/20 italic"
                          placeholder="Business CNIC / Registration ID"
                        />
                      </div>

                      <div className="group md:col-span-2">
                        <label className="block text-xs font-black text-stone-400 uppercase tracking-widest mb-2 group-focus-within:text-amber-600 transition-colors">
                          Business Bio / Services
                        </label>
                        <textarea
                          name="bio"
                          value={formData.bio || ""}
                          onChange={handleChange}
                          rows={3}
                          className="w-full bg-stone-50 border border-stone-200 focus:border-amber-500 rounded-2xl p-4 text-sm font-bold text-stone-900 focus:ring-2 focus:ring-amber-500/20 italic"
                          placeholder="Describe your business operations, agricultural exports, wholesale services..."
                        />
                      </div>
                    </div>
                  </div>

                  {/* Business Professional Links */}
                  <div className="space-y-6 pt-6 border-t border-stone-100">
                    <h3 className="text-xs font-black text-stone-400 uppercase tracking-[0.3em] border-b border-stone-50 pb-2">
                      Social & Professional Links
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="group">
                        <label className="block text-xs font-black text-stone-400 uppercase tracking-widest mb-2 group-focus-within:text-amber-600 transition-colors">
                          Business Website
                        </label>
                        <div className="relative">
                          <Globe className="w-4 h-4 text-stone-400 absolute left-4 top-1/2 -translate-y-1/2" />
                          <input
                            type="url"
                            name="websiteUrl"
                            value={formData.websiteUrl || ""}
                            onChange={handleChange}
                            className="w-full bg-stone-50 border border-stone-200 focus:border-amber-500 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold text-stone-900 focus:ring-2 focus:ring-amber-500/20 italic"
                            placeholder="https://business.com"
                          />
                        </div>
                      </div>

                      <div className="group">
                        <label className="block text-xs font-black text-stone-400 uppercase tracking-widest mb-2 group-focus-within:text-amber-600 transition-colors">
                          Business Facebook Page
                        </label>
                        <input
                          type="text"
                          name="facebookPage"
                          value={formData.facebookPage || ""}
                          onChange={handleChange}
                          className="w-full bg-stone-50 border border-stone-200 focus:border-amber-500 rounded-2xl p-4 text-sm font-bold text-stone-900 focus:ring-2 focus:ring-amber-500/20 italic"
                          placeholder="Business facebook page link"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Section 4: Chat History Management */}
              <div className="space-y-6 pt-6 border-t border-stone-100">
                <h3 className="text-xs font-black text-stone-400 uppercase tracking-[0.3em] border-b border-stone-50 pb-2 flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Chat & Storage Settings
                </h3>

                <div className="bg-amber-50/50 border border-amber-100 rounded-3xl p-6 sm:p-8 space-y-4">
                  <div>
                    <h4 className="text-sm font-black text-stone-900 uppercase tracking-tight flex items-center gap-2">
                      Auto-clear Chat History
                    </h4>
                    <p className="text-xs text-stone-500 mt-1 font-medium leading-relaxed">
                      Automatically delete messages older than a specific period to declutter your inbox and manage storage. This action is permanent.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                    {[
                      { id: 'off', label: 'Off', desc: 'Keep all' },
                      { id: '30', label: '30 Days', desc: 'Auto-delete' },
                      { id: '90', label: '90 Days', desc: 'Auto-delete' }
                    ].map((option) => (
                      <label 
                        key={option.id}
                        className={`relative flex flex-col p-4 rounded-2xl border-2 cursor-pointer transition-all duration-200 ${
                          formData.autoClearHistory === option.id 
                            ? 'border-amber-500 bg-amber-50 ring-4 ring-amber-500/10' 
                            : 'border-stone-100 bg-white hover:border-stone-200'
                        }`}
                      >
                        <input
                          type="radio"
                          name="autoClearHistory"
                          value={option.id}
                          checked={formData.autoClearHistory === option.id}
                          onChange={handleChange}
                          className="sr-only"
                        />
                        <span className={`text-sm font-black uppercase tracking-tight ${
                          formData.autoClearHistory === option.id ? 'text-amber-700' : 'text-stone-700'
                        }`}>
                          {option.label}
                        </span>
                        <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider mt-1">
                          {option.desc}
                        </span>
                        {formData.autoClearHistory === option.id && (
                          <div className="absolute top-3 right-3">
                            <CheckCircle className="w-4 h-4 text-amber-500" />
                          </div>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 pt-8 border-t border-stone-100">
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full sm:flex-grow bg-stone-900 hover:bg-stone-850 text-white font-black py-4 px-6 rounded-2xl transition-all shadow-md active:scale-95 disabled:opacity-50 uppercase tracking-widest text-xs italic cursor-pointer flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/25 border-t-white rounded-full animate-spin" />
                      <span>Saving Credentials...</span>
                    </>
                  ) : (
                    <span>Save Settings & Details</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("profile")}
                  className="w-full sm:w-auto px-8 py-4 bg-stone-100 text-stone-400 font-black rounded-2xl text-xs uppercase tracking-widest hover:bg-stone-200 transition-all cursor-pointer text-center"
                >
                  Discard
                </button>
              </div>
            </form>

            <AccountSecurityCard
              user={user}
              linkPasswordAccount={linkPasswordAccount}
              linkGoogleAccount={linkGoogleAccount}
              sendVerificationEmail={sendVerificationEmail}
            />
          </div>
        </div>
      )}



      {activeTab === "kyc" && (
        <div className="space-y-10 animate-in slide-in-from-bottom-4 duration-500">
          {/* Header Card */}
          <div className="bg-white p-8 md:p-10 rounded-[2rem] border border-stone-100 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 blur-3xl rounded-full" />
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <h2 className="text-2xl md:text-3xl font-black text-stone-900 uppercase italic tracking-tighter leading-none">
                    Identity Verification (KYC)
                  </h2>
                </div>
                <p className="text-stone-400 font-bold uppercase tracking-widest text-xs md:text-xs">
                  Secure, optional, and 100% free identity validation to unlock the verified blue tick badge.
                </p>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 text-xs font-black uppercase tracking-widest rounded-lg border border-emerald-100 italic">
                ✨ Free Badge
              </div>
            </div>
          </div>

          {/* KYC APPLICATION STATUS, DETAILS AND TIMELINE HUB */}
          {kycApp && !isEditingKyc && (
            <div className="bg-white p-6 md:p-10 rounded-[2.5rem] border border-stone-100 shadow-sm space-y-10">
              
              {/* Application Tracking and Status Header */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center pb-6 border-b border-stone-100 gap-4">
                <div>
                  <span className="text-xs text-stone-400 font-bold uppercase tracking-widest block mb-1">
                    Application Tracking Number
                  </span>
                  <span className="font-mono text-xl font-black text-stone-900 tracking-tight flex items-center gap-1.5">
                    <Hash className="w-5 h-5 text-amber-500" />
                    {kycApp.trackingNumber || `MND-KYC-${(kycApp.id || user?.uid || "").slice(0, 8).toUpperCase()}`}
                  </span>
                </div>
                <div className="flex flex-col items-start md:items-end gap-1">
                  <span className="text-xs text-stone-400 font-bold uppercase tracking-widest block">
                    Application Status
                  </span>
                  <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider italic ${
                    kycApp.status === "PENDING" ? "bg-amber-100 text-amber-850" :
                    kycApp.status === "APPROVED" ? "bg-emerald-100 text-emerald-850" :
                    kycApp.status === "REJECTED" ? "bg-red-100 text-red-850" :
                    kycApp.status === "REVOKED" ? "bg-stone-200 text-stone-800" :
                    kycApp.status === "RESUME_REQUESTED" ? "bg-blue-100 text-blue-850" :
                    "bg-rose-100 text-rose-850" // PERMANENTLY_REMOVED
                  }`}>
                    {kycApp.status === "PENDING" && "⏳ Pending Review"}
                    {kycApp.status === "APPROVED" && "✅ Active / Approved"}
                    {kycApp.status === "REJECTED" && "❌ Rejected"}
                    {kycApp.status === "REVOKED" && "⛔ Revoked"}
                    {kycApp.status === "RESUME_REQUESTED" && "🔄 Resume Requested"}
                    {kycApp.status === "PERMANENTLY_REMOVED" && "🗑️ Removed"}
                  </span>
                </div>
              </div>

              {/* Status Specific Action Cards */}
              {kycApp.status === "PENDING" && (
                <div className="p-6 bg-amber-50 rounded-2xl border border-amber-200 text-amber-800 flex items-start gap-4">
                  <Clock className="w-8 h-8 shrink-0 mt-0.5 text-amber-600 animate-pulse" />
                  <div>
                    <h3 className="font-black text-xs md:text-sm uppercase tracking-wider mb-1">Your Application is Under Review</h3>
                    <p className="text-xs font-bold opacity-90 leading-relaxed">
                      Avora compliance managers are currently reviewing your documents. Our standard review window is 4 to 12 hours. You cannot edit this application while it is being audited.
                    </p>
                  </div>
                </div>
              )}

              {kycApp.status === "APPROVED" && (
                <div className="p-6 bg-emerald-50 rounded-2xl border border-emerald-200 text-emerald-800 space-y-4">
                  <div className="flex items-start gap-4">
                    <ShieldCheck className="w-8 h-8 shrink-0 mt-0.5 text-emerald-600" />
                    <div>
                      <h3 className="font-black text-xs md:text-sm uppercase tracking-wider mb-1">KYC Verification Active & Approved</h3>
                      <p className="text-xs font-bold opacity-90 leading-relaxed">
                        Congratulations! Your identity is locked and verified with Avora. The Request Profile Change feature is now unlocked under your Settings tab.
                      </p>
                    </div>
                  </div>
                  
                  <div className="pt-2 border-t border-emerald-200/50 flex flex-wrap items-center gap-4">
                    <button
                      onClick={() => {
                        setNameChangeNewName("");
                        setNameChangeReason("");
                        setNameChangeMsg("");
                        setShowNameChangeModal(true);
                      }}
                      className="px-5 py-2.5 bg-stone-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-stone-800 transition-all flex items-center gap-2 shadow-md"
                    >
                      <Edit3 className="w-4 h-4 text-amber-500" /> Request Profile Change
                    </button>
                  </div>

                  {pendingNameChange && (
                    <div className="bg-white p-5 rounded-xl border border-emerald-100 space-y-3 mt-2">
                      <h4 className="font-black text-stone-900 uppercase italic text-xs tracking-wider flex items-center gap-2">
                        <Clock className="w-4 h-4 text-amber-500 animate-spin" /> Profile Change Request Status
                      </h4>
                      <div className="text-xs font-bold text-stone-600 space-y-1.5">
                        <div className="flex justify-between">
                          <span>Requested Changes:</span>
                          <span className="text-stone-900 font-black italic">Details submitted to Admin</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Reason:</span>
                          <span className="text-stone-400 italic">{pendingNameChange.reason}</span>
                        </div>
                        <div className="flex justify-between items-center pt-1.5 border-t border-stone-100">
                          <span>Status:</span>
                          <span className={`px-2 py-0.5 rounded text-xs font-black uppercase ${
                            pendingNameChange.status === "PENDING" ? "bg-amber-100 text-amber-800" :
                            pendingNameChange.status === "APPROVED" ? "bg-emerald-100 text-emerald-800" :
                            "bg-red-100 text-red-800"
                          }`}>{pendingNameChange.status}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {kycApp.status === "REVOKED" && (
                <div className="p-6 bg-red-50 rounded-2xl border border-red-200 text-red-800 space-y-4">
                  <div className="flex items-start gap-4">
                    <ShieldAlert className="w-8 h-8 shrink-0 mt-0.5 text-red-600 animate-bounce" />
                    <div className="flex-1">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-1">
                        <h3 className="font-black text-xs md:text-sm uppercase tracking-wider">KYC Status Revoked</h3>
                        {appealTimeRemaining && !isAppealTimeExpired && !isAppealRejected && (
                          <div className="flex items-center gap-1.5 px-3 py-1 bg-red-100 text-red-700 rounded-full font-bold text-xs uppercase tracking-widest border border-red-200 w-max">
                            <Clock className="w-3 h-3 animate-pulse" />
                            Appeal Deadline: {appealTimeRemaining}
                          </div>
                        )}
                      </div>
                      <p className="text-xs font-bold opacity-90 leading-relaxed">
                        Your verification has been suspended due to violations of Avora seller rules.
                        Reason: <strong className="italic text-red-900 font-black">"{kycApp.revocationReason || "Policy violation / fraudulent activity indicator"}"</strong>
                      </p>
                      {isAppealRejected && (kycApp as any).appealRejectionReason && (
                        <p className="text-xs font-bold text-red-700 mt-2 p-2 bg-white/50 rounded-lg border border-red-100">
                          <span className="uppercase tracking-widest text-red-500 mr-2 block mb-0.5 font-black">Latest Appeal Decision:</span>
                          {(kycApp as any).appealRejectionReason}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {!isAppealTimeExpired && !isAppealRejected ? (
                    <div className="pt-4 border-t border-red-200/50 space-y-3">
                      <p className="text-xs font-semibold text-stone-600 leading-normal">
                        You have 24 hours to submit an appeal requesting the compliance managers to re-evaluate and resume your verified seller status.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-2.5">
                        <input
                          type="text"
                          value={appealMessage}
                          onChange={(e) => setAppealMessage(e.target.value)}
                          placeholder="Write your appeal message here..."
                          className="flex-grow bg-white border border-red-200/60 rounded-xl px-4 py-3 text-xs focus:ring-2 focus:ring-red-500/20 outline-none font-bold text-stone-900"
                        />
                        <button
                          onClick={handleRequestResume}
                          disabled={kycSubmitting || !appealMessage.trim()}
                          className="shrink-0 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-stone-900 font-black uppercase tracking-widest text-xs px-6 py-3 rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-2"
                        >
                          Submit Appeal
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="pt-3 border-t border-red-200/50 flex flex-col sm:flex-row items-center justify-between gap-3">
                      <p className="text-xs font-bold text-red-700">
                        {isAppealRejected 
                          ? "Your appeal was declined. Appeal rights for this revocation cycle have concluded." 
                          : "The 24-hour appeal window has expired for this revocation cycle."}
                      </p>
                      <button
                        onClick={handleStartFreshKyc}
                        className="shrink-0 px-6 py-2.5 bg-white hover:bg-stone-50 text-stone-900 border border-stone-300 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-sm"
                      >
                        ✨ Submit Fresh Application
                      </button>
                    </div>
                  )}
                </div>
              )}

              {kycApp.status === "RESUME_REQUESTED" && (
                <div className="p-6 bg-blue-50 rounded-2xl border border-blue-200 text-blue-800 flex items-start gap-4">
                  <Clock className="w-8 h-8 shrink-0 mt-0.5 text-blue-600 animate-pulse" />
                  <div>
                    <h3 className="font-black text-xs md:text-sm uppercase tracking-wider mb-1">KYC Reinstatement Pending</h3>
                    <p className="text-xs font-bold opacity-90 leading-relaxed">
                      You have filed a request to resume your KYC verification status. Compliance admins are currently reviewing your history. Standard processing timeframe is 4 to 12 hours.
                    </p>
                  </div>
                </div>
              )}

              {(kycApp.status === "REJECTED" || kycApp.status === "PERMANENTLY_REMOVED") && (
                <div className="p-6 bg-rose-50 rounded-2xl border border-rose-200 text-rose-800 space-y-4">
                  <div className="flex items-start gap-4">
                    {kycApp.status === "REJECTED" ? (
                      <XCircle className="w-8 h-8 shrink-0 mt-0.5 text-rose-600" />
                    ) : (
                      <AlertTriangle className="w-8 h-8 shrink-0 mt-0.5 text-rose-600 animate-pulse" />
                    )}
                    <div>
                      <h3 className="font-black text-xs md:text-sm uppercase tracking-wider mb-1">
                        {kycApp.status === "REJECTED" ? "KYC Application Rejected" : "KYC Status Permanently Removed"}
                      </h3>
                      <p className="text-xs font-bold opacity-90 leading-relaxed">
                        {kycApp.status === "REJECTED" 
                          ? `Your previous application did not pass compliance. Reason: "${kycApp.rejectionReason || "Blurry document details or photograph mismatch"}".` 
                          : "Your KYC verification status has been permanently removed on policy violating grounds or failure to appeal in time."}
                      </p>
                    </div>
                  </div>
                  
                  <div className="pt-2 border-t border-rose-200/50 flex flex-wrap gap-4">
                    {kycApp.status === "REJECTED" && (
                      <button
                        onClick={handleStartEditKyc}
                        className="px-6 py-3 bg-stone-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-stone-850 transition-all flex items-center gap-2 shadow-md active:scale-95"
                      >
                        <Edit3 className="w-4 h-4 text-amber-500" /> Edit & Re-Submit Application
                      </button>
                    )}
                    <button
                      onClick={handleStartFreshKyc}
                      className="px-6 py-3 bg-white text-stone-900 border border-stone-200 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-stone-50 transition-all flex items-center gap-2 shadow-sm active:scale-95"
                    >
                      ✨ Submit Fresh Application
                    </button>
                  </div>
                </div>
              )}

              {/* Submitted Details Review Section */}
              <div className="bg-stone-50 p-6 rounded-2xl border border-stone-100 space-y-6">
                <h4 className="font-black text-stone-900 uppercase italic text-xs tracking-wider border-b border-stone-200 pb-2 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-stone-400" /> Provided KYC Application Details ({
                    kycApp.category === "FIRM_COMPANY" ? "Firm / Company KYC" :
                    (kycApp.category === "OWN_BUSINESS" || kycApp.category === "BUSINESS") ? "Own Business KYC" :
                    "Individual KYC"
                  })
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 text-xs font-bold text-stone-600">
                  <div>
                    <span className="block text-xs text-stone-400 uppercase tracking-widest mb-1">
                      {kycApp.category === "FIRM_COMPANY" ? "Representative Full Legal Name" : "Full Legal Name"}
                    </span>
                    <span className="text-stone-900 text-sm font-black italic">{kycApp.legalName}</span>
                  </div>

                  {(kycApp.category === "OWN_BUSINESS" || kycApp.category === "BUSINESS") && (
                    <div>
                      <span className="block text-xs text-stone-400 uppercase tracking-widest mb-1">Business / Trading Name</span>
                      <span className="text-stone-900 text-sm font-black italic">{kycApp.businessName}</span>
                    </div>
                  )}

                  {(kycApp.category === "OWN_BUSINESS" || kycApp.category === "BUSINESS") && (kycApp as any).businessType && (
                    <div>
                      <span className="block text-xs text-stone-400 uppercase tracking-widest mb-1">Business Type / Category</span>
                      <span className="text-stone-900 text-sm font-black italic">{(kycApp as any).businessType}</span>
                    </div>
                  )}

                  {kycApp.category === "FIRM_COMPANY" && (
                    <div>
                      <span className="block text-xs text-stone-400 uppercase tracking-widest mb-1">Company / Entity Legal Name</span>
                      <span className="text-stone-900 text-sm font-black italic">{(kycApp as any).companyName || kycApp.businessName}</span>
                    </div>
                  )}

                  {kycApp.category === "FIRM_COMPANY" && (
                    <div>
                      <span className="block text-xs text-stone-400 uppercase tracking-widest mb-1">Company Registration Number</span>
                      <span className="text-stone-900 text-sm font-black italic">{(kycApp as any).registrationNumber}</span>
                    </div>
                  )}

                  {kycApp.category === "FIRM_COMPANY" && (
                    <div>
                      <span className="block text-xs text-stone-400 uppercase tracking-widest mb-1">Representative Designation</span>
                      <span className="text-stone-900 text-sm font-black italic">{(kycApp as any).repDesignation}</span>
                    </div>
                  )}

                  <div>
                    <span className="block text-xs text-stone-400 uppercase tracking-widest mb-1">
                      {kycApp.category === "FIRM_COMPANY" ? "Representative Identity Document Number" : "Government-Issued Identity Document Number"}
                    </span>
                    <span className="text-stone-900 text-sm font-black">{kycApp.cnicNumber}</span>
                  </div>

                  <div>
                    <span className="block text-xs text-stone-400 uppercase tracking-widest mb-1">
                      {kycApp.category === "FIRM_COMPANY" ? "Representative Phone" : (kycApp.category === "OWN_BUSINESS" || kycApp.category === "BUSINESS") ? "Owner Phone" : "Mobile Number"}
                    </span>
                    <span className="text-stone-900 text-sm font-black">{kycApp.mobileNumber}</span>
                  </div>

                  {(kycApp as any).businessPhone && (
                    <div>
                      <span className="block text-xs text-stone-400 uppercase tracking-widest mb-1">Business Phone</span>
                      <span className="text-stone-900 text-sm font-black">{(kycApp as any).businessPhone}</span>
                    </div>
                  )}

                  <div>
                    <span className="block text-xs text-stone-400 uppercase tracking-widest mb-1">Country</span>
                    <span className="text-stone-900 text-sm font-black italic flex items-center gap-1.5">
                      <span>{getCountryFlag(kycApp.country)}</span>
                      <span>{kycApp.country || "-"}</span>
                    </span>
                  </div>
                  <div>
                    <span className="block text-xs text-stone-400 uppercase tracking-widest mb-1">City</span>
                    <span className="text-stone-900 text-sm font-black italic">{kycApp.city}</span>
                  </div>
                  <div>
                    <span className="block text-xs text-stone-400 uppercase tracking-widest mb-1">Submission Date & Time</span>
                    <span className="text-stone-900 text-sm font-black">{new Date(kycApp.submittedAt).toLocaleString()}</span>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="block text-xs text-stone-400 uppercase tracking-widest mb-1">
                      {kycApp.category === "FIRM_COMPANY" ? "Registered Office / Business Address" : (kycApp.category === "OWN_BUSINESS" || kycApp.category === "BUSINESS") ? "Business / Trading Address" : "Residential Address"}
                    </span>
                    <span className="text-stone-900 text-xs italic">
                      {(kycApp.category === "OWN_BUSINESS" || kycApp.category === "BUSINESS" || kycApp.category === "FIRM_COMPANY") ? kycApp.businessAddress : kycApp.residentialAddress}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 pt-4 border-t border-stone-200">
                  <div>
                    <span className="block text-xs text-stone-400 font-bold uppercase tracking-widest mb-2">
                      {kycApp.category === "FIRM_COMPANY" ? "Representative ID Front" : "Identity Document Front"}
                    </span>
                    <div className="relative aspect-[16/10] bg-stone-100 rounded-xl overflow-hidden border border-stone-200 shadow-sm">
                      <img src={kycApp.cnicFrontPhoto} className="w-full h-full object-cover" alt="Identity Document Front" />
                    </div>
                  </div>
                  <div>
                    <span className="block text-xs text-stone-400 font-bold uppercase tracking-widest mb-2">
                      {kycApp.category === "FIRM_COMPANY" ? "Representative ID Back" : "Identity Document Back"}
                    </span>
                    <div className="relative aspect-[16/10] bg-stone-100 rounded-xl overflow-hidden border border-stone-200 shadow-sm flex items-center justify-center">
                      {kycApp.cnicBackPhoto ? (
                        <img src={kycApp.cnicBackPhoto} className="w-full h-full object-cover" alt="Identity Document Back" />
                      ) : (
                        <span className="text-[11px] font-bold text-stone-400 uppercase">Optional / Not Provided</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="block text-xs text-stone-400 font-bold uppercase tracking-widest mb-2">
                      {kycApp.category === "FIRM_COMPANY" ? "Representative Selfie" : "Selfie"}
                    </span>
                    <div className="relative aspect-[16/10] bg-stone-100 rounded-xl overflow-hidden border border-stone-200 shadow-sm">
                      <img src={kycApp.selfiePhoto} className="w-full h-full object-cover" alt="Selfie" />
                    </div>
                  </div>
                  {(kycApp as any).businessDocPhoto && (
                    <div>
                      <span className="block text-xs text-stone-400 font-bold uppercase tracking-widest mb-2">
                        Business / Registration Doc
                      </span>
                      <div className="relative aspect-[16/10] bg-stone-100 rounded-xl overflow-hidden border border-stone-200 shadow-sm">
                        <img src={(kycApp as any).businessDocPhoto} className="w-full h-full object-cover" alt="Business Registration Document" />
                      </div>
                    </div>
                  )}
                  {(kycApp as any).repAuthorityLetter && (
                    <div>
                      <span className="block text-xs text-stone-400 font-bold uppercase tracking-widest mb-2">
                        Authority Letter / Board Resolution
                      </span>
                      <div className="relative aspect-[16/10] bg-stone-100 rounded-xl overflow-hidden border border-stone-200 shadow-sm">
                        <img src={(kycApp as any).repAuthorityLetter} className="w-full h-full object-cover" alt="Authority Letter" />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Chronological Administrative Action Logs / History Timeline */}
              <div className="bg-stone-50/50 p-6 rounded-2xl border border-stone-100/80 space-y-6">
                <h4 className="font-black text-stone-900 uppercase italic text-xs tracking-wider border-b border-stone-200 pb-2 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-500" /> Administrative Action History Logs (Chronological Audit Trail)
                </h4>
                
                {kycApp.history && kycApp.history.length > 0 ? (
                  <div className="relative border-l border-stone-200 pl-6 ml-4 space-y-8">
                    {kycApp.history.map((item, index) => (
                      <div key={index} className="relative">
                        {/* Dot indicator */}
                        <div className={`absolute -left-[31px] top-1 w-4 h-4 rounded-full border-2 bg-white flex items-center justify-center ${
                          item.status === 'APPROVED' ? 'border-emerald-500 text-emerald-500' :
                          item.status === 'REJECTED' ? 'border-red-500 text-red-500' :
                          item.status === 'REVOKED' ? 'border-stone-500 text-stone-400' :
                          item.status === 'PENDING' ? 'border-amber-500 text-amber-500' :
                          'border-red-600 text-red-600'
                        }`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${
                            item.status === 'APPROVED' ? 'bg-emerald-500' :
                            item.status === 'REJECTED' ? 'bg-red-500' :
                            item.status === 'REVOKED' ? 'bg-stone-500' :
                            item.status === 'PENDING' ? 'bg-amber-500' :
                            'bg-red-600'
                          }`} />
                        </div>
                        <div>
                          <div className="flex flex-wrap items-baseline gap-2">
                            <span className="font-black text-stone-900 text-xs uppercase tracking-wide">
                              {item.action || item.status}
                            </span>
                            <span className="text-xs text-stone-400 font-mono">
                              {new Date(item.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-stone-400 font-bold text-xs mt-1 leading-relaxed">
                            {item.reason || `Verification status changed to ${item.status}.`}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-stone-400 font-bold uppercase tracking-wider text-xs italic py-2">
                    No detailed administrative logs recorded yet. This is a newly migrated account.
                  </div>
                )}
              </div>

            </div>
          )}

          {/* KYC INITIATE OR SUBMIT FORM */}
          {(!kycApp || isEditingKyc) && (
            <div className="bg-white p-6 md:p-10 rounded-[2.5rem] border border-stone-100 shadow-sm space-y-8">
              {isEditingKyc && (
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-6 bg-stone-900 text-white rounded-2xl gap-4 shadow-xl">
                  <div>
                    <h3 className="font-black text-xs md:text-sm uppercase tracking-wider mb-1 flex items-center gap-2 text-amber-400">
                      <Edit3 className="w-4 h-4" /> Editing KYC Application
                    </h3>
                    <p className="text-xs text-stone-300 font-bold uppercase tracking-widest leading-relaxed">
                      {kycTrackingNumber ? `Resubmitting under tracking: ${kycTrackingNumber}` : "Submitting a fresh KYC Application with a new tracking number"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsEditingKyc(false)}
                    className="px-4 py-2 bg-stone-850 hover:bg-stone-800 text-stone-200 hover:text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all border border-stone-800"
                  >
                    Cancel & View Status
                  </button>
                </div>
              )}

              {kycApp?.status === "REJECTED" && !isEditingKyc && (
                <div className="p-6 bg-red-50 text-red-800 rounded-2xl border border-red-200 space-y-2">
                  <div className="flex items-center gap-2 font-black uppercase text-xs">
                    <XCircle className="w-5 h-5 text-red-600" /> KYC Application Rejected
                  </div>
                  <p className="text-xs font-bold opacity-90 pb-2">
                     Your previous application did not pass compliance. Review reason below and file a clean submission:
                  </p>
                  <p className="p-3 bg-white text-red-700 italic border border-red-100 rounded-xl font-bold text-xs">
                    "{kycApp.rejectionReason || "Blurry document details or photograph mismatch"}"
                  </p>
                </div>
              )}

              {kycApp?.status === "PERMANENTLY_REMOVED" && !isEditingKyc && (
                <div className="p-6 bg-red-50 text-red-800 rounded-2xl border border-red-200 space-y-2">
                  <div className="flex items-center gap-2 font-black uppercase text-xs">
                    <AlertTriangle className="w-5 h-5 text-red-600" /> KYC Status Permanently Removed
                  </div>
                  <p className="text-xs font-bold opacity-90 pb-2">
                     Your previous KYC verification status was permanently removed on policy violating grounds. Under Avora policies, you can submit a standard fresh KYC application for re-evaluation.
                  </p>
                </div>
              )}

              {/* Stage Selection */}
              <div>
                <label className="block text-xs font-black text-stone-400 uppercase tracking-widest pl-2 mb-4">
                  Select Your Verification Category:
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      setKycCategory("INDIVIDUAL");
                      setKycError("");
                    }}
                    className={`p-5 rounded-2xl border-2 text-left flex flex-col justify-between gap-3 transition-all relative ${
                      kycCategory === "INDIVIDUAL"
                        ? "border-stone-900 bg-stone-50/80 shadow-sm"
                        : "border-stone-100 bg-white hover:border-amber-300"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className={`p-3 rounded-xl ${kycCategory === "INDIVIDUAL" ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-500"}`}>
                        <UserIcon className="w-5 h-5" />
                      </div>
                      {kycCategory === "INDIVIDUAL" && (
                        <CheckCircle className="w-5 h-5 text-emerald-500 fill-emerald-500/10" />
                      )}
                    </div>
                    <div>
                      <h4 className="font-black text-stone-900 text-xs uppercase tracking-wider">Individual KYC</h4>
                      <p className="text-[11px] font-bold text-stone-500 mt-1 leading-relaxed">
                        Verify yourself under your legal/personal identity.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setKycCategory("OWN_BUSINESS");
                      setKycError("");
                    }}
                    className={`p-5 rounded-2xl border-2 text-left flex flex-col justify-between gap-3 transition-all relative ${
                      kycCategory === "OWN_BUSINESS"
                        ? "border-stone-900 bg-stone-50/80 shadow-sm"
                        : "border-stone-100 bg-white hover:border-amber-300"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className={`p-3 rounded-xl ${kycCategory === "OWN_BUSINESS" ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-500"}`}>
                        <Store className="w-5 h-5" />
                      </div>
                      {kycCategory === "OWN_BUSINESS" && (
                        <CheckCircle className="w-5 h-5 text-emerald-500 fill-emerald-500/10" />
                      )}
                    </div>
                    <div>
                      <h4 className="font-black text-stone-900 text-xs uppercase tracking-wider">Own Business KYC</h4>
                      <p className="text-[11px] font-bold text-stone-500 mt-1 leading-relaxed">
                        Verify your owner-operated business using your personal identity as primary verification.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setKycCategory("FIRM_COMPANY");
                      setKycError("");
                    }}
                    className={`p-5 rounded-2xl border-2 text-left flex flex-col justify-between gap-3 transition-all relative ${
                      kycCategory === "FIRM_COMPANY"
                        ? "border-stone-900 bg-stone-50/80 shadow-sm"
                        : "border-stone-100 bg-white hover:border-amber-300"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className={`p-3 rounded-xl ${kycCategory === "FIRM_COMPANY" ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-500"}`}>
                        <Building2 className="w-5 h-5" />
                      </div>
                      {kycCategory === "FIRM_COMPANY" && (
                        <CheckCircle className="w-5 h-5 text-emerald-500 fill-emerald-500/10" />
                      )}
                    </div>
                    <div>
                      <h4 className="font-black text-stone-900 text-xs uppercase tracking-wider">Firm / Company KYC</h4>
                      <p className="text-[11px] font-bold text-stone-500 mt-1 leading-relaxed">
                        Verify a registered firm, company, organization or brand through legal entity & authorized representative.
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* KYC FORM FIELDS */}
              <form onSubmit={handleKycSubmit} className="space-y-6 pt-4 border-t border-stone-100">
                {kycError && (
                  <div className="p-4 bg-red-50 border border-red-200 text-red-700 font-bold text-xs rounded-xl flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" /> {kycError}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* FIRM/COMPANY SPECIFIC: Company Name & Registration Number */}
                  {kycCategory === "FIRM_COMPANY" && (
                    <>
                      <div className="group">
                        <label className="block text-xs font-black text-stone-500 uppercase tracking-widest pl-1 mb-2">
                          Company / Entity Registered Name *
                        </label>
                        <input
                          required
                          type="text"
                          value={kycCompanyName}
                          onChange={(e) => setKycCompanyName(e.target.value)}
                          className="w-full bg-stone-50 border-none rounded-2xl p-4 text-xs font-bold text-stone-900 focus:ring-2 focus:ring-stone-900/10"
                          placeholder="e.g. AgriTech International (Pvt) Ltd"
                        />
                      </div>

                      <div className="group">
                        <label className="block text-xs font-black text-stone-500 uppercase tracking-widest pl-1 mb-2">
                          Registration / Incorporation Number *
                        </label>
                        <input
                          required
                          type="text"
                          value={kycRegistrationNumber}
                          onChange={(e) => setKycRegistrationNumber(e.target.value)}
                          className="w-full bg-stone-50 border-none rounded-2xl p-4 text-xs font-mono font-bold text-stone-900 focus:ring-2 focus:ring-stone-900/10"
                          placeholder="e.g. REG-2024-99812"
                        />
                      </div>
                    </>
                  )}

                  {/* OWN BUSINESS SPECIFIC: Business Name & Type */}
                  {(kycCategory === "OWN_BUSINESS" || kycCategory === "BUSINESS") && (
                    <>
                      <div className="group">
                        <label className="block text-xs font-black text-stone-500 uppercase tracking-widest pl-1 mb-2">
                          Business / Trading Name *
                        </label>
                        <input
                          required
                          type="text"
                          value={kycBusinessName}
                          onChange={(e) => setKycBusinessName(e.target.value)}
                          className="w-full bg-stone-50 border-none rounded-2xl p-4 text-xs font-bold text-stone-900 focus:ring-2 focus:ring-stone-900/10"
                          placeholder="e.g. Imran Seeds & Grain Traders"
                        />
                      </div>

                      <div className="group">
                        <label className="block text-xs font-black text-stone-500 uppercase tracking-widest pl-1 mb-2">
                          Business Type / Category (Optional)
                        </label>
                        <input
                          type="text"
                          value={kycBusinessType}
                          onChange={(e) => setKycBusinessType(e.target.value)}
                          className="w-full bg-stone-50 border-none rounded-2xl p-4 text-xs font-bold text-stone-900 focus:ring-2 focus:ring-stone-900/10"
                          placeholder="e.g. Agricultural Wholesale, Livestock, Machinery"
                        />
                      </div>
                    </>
                  )}

                  {/* Full Legal Name */}
                  <div className="group">
                    <label className="block text-xs font-black text-stone-500 uppercase tracking-widest pl-1 mb-2">
                      {kycCategory === "FIRM_COMPANY"
                        ? "Authorized Representative Full Legal Name *"
                        : kycCategory === "OWN_BUSINESS"
                        ? "Owner Full Legal Name *"
                        : "Full Legal Name (Matching Identity Document) *"}
                    </label>
                    <input
                      required
                      type="text"
                      value={kycLegalName}
                      onChange={(e) => setKycLegalName(e.target.value)}
                      className="w-full bg-stone-50 border-none rounded-2xl p-4 text-xs font-bold text-stone-900 focus:ring-2 focus:ring-stone-900/10"
                      placeholder="e.g. Muhammad Imran"
                    />
                  </div>

                  {/* FIRM/COMPANY SPECIFIC: Representative Designation */}
                  {kycCategory === "FIRM_COMPANY" && (
                    <div className="group">
                      <label className="block text-xs font-black text-stone-500 uppercase tracking-widest pl-1 mb-2">
                        Representative Designation / Role *
                      </label>
                      <input
                        required
                        type="text"
                        value={kycRepDesignation}
                        onChange={(e) => setKycRepDesignation(e.target.value)}
                        className="w-full bg-stone-50 border-none rounded-2xl p-4 text-xs font-bold text-stone-900 focus:ring-2 focus:ring-stone-900/10"
                        placeholder="e.g. Managing Director, CEO, Partner"
                      />
                    </div>
                  )}

                  {/* Document Type Selector */}
                  <div className="group">
                    <label className="block text-xs font-black text-stone-500 uppercase tracking-widest pl-1 mb-2">
                      Identity Document Type
                    </label>
                    <select
                      value={kycDocumentType}
                      onChange={(e) => setKycDocumentType(e.target.value as any)}
                      className="w-full bg-stone-50 border-none rounded-2xl p-4 text-xs font-bold text-stone-900 focus:ring-2 focus:ring-stone-900/10"
                    >
                      <option value="NATIONAL_ID">National ID Card / Government Issued ID</option>
                      <option value="PASSPORT">Passport</option>
                      <option value="DRIVING_LICENSE">Driving License</option>
                      <option value="OTHER_GOVT_ID">Other Government Document</option>
                    </select>
                  </div>

                  {/* Identity Document Number */}
                  <div className="group">
                    <label className="block text-xs font-black text-stone-500 uppercase tracking-widest pl-1 mb-2">
                      {kycCategory === "FIRM_COMPANY"
                        ? "Representative Identity Document Number *"
                        : "Government-Issued Identity Document Number *"}
                    </label>
                    <input
                      required
                      type="text"
                      maxLength={40}
                      value={kycCnicNumber}
                      onChange={(e) => setKycCnicNumber(e.target.value)}
                      className="w-full bg-stone-50 border-none rounded-2xl p-4 text-xs font-mono font-bold text-stone-900 focus:ring-2 focus:ring-stone-900/10"
                      placeholder="Enter Document / ID Number"
                    />
                  </div>

                  {/* Primary Mobile Phone */}
                  <div className="group">
                    <label className="block text-xs font-black text-stone-500 uppercase tracking-widest pl-1 mb-2">
                      {kycCategory === "FIRM_COMPANY"
                        ? "Representative Phone Number *"
                        : kycCategory === "OWN_BUSINESS"
                        ? "Owner Phone Number *"
                        : "Mobile Phone Number *"}
                    </label>
                    <PhoneInput
                      value={kycMobileNumber}
                      onChange={setKycMobileNumber}
                      placeholder="e.g. 321 1234567"
                    />
                  </div>

                  {/* Business Phone (Optional for Business/Company) */}
                  {(kycCategory === "OWN_BUSINESS" || kycCategory === "BUSINESS" || kycCategory === "FIRM_COMPANY") && (
                    <div className="group">
                      <label className="block text-xs font-black text-stone-500 uppercase tracking-widest pl-1 mb-2">
                        Separate Business / Landline Phone (Optional)
                      </label>
                      <input
                        type="text"
                        value={kycBusinessPhone}
                        onChange={(e) => setKycBusinessPhone(e.target.value)}
                        className="w-full bg-stone-50 border-none rounded-2xl p-4 text-xs font-bold text-stone-900 focus:ring-2 focus:ring-stone-900/10"
                        placeholder="e.g. +92 51 1234567"
                      />
                    </div>
                  )}

                  {/* Country */}
                  <div className="group">
                    <label className="block text-xs font-black text-stone-500 uppercase tracking-widest pl-1 mb-2">
                      Country *
                    </label>
                    <CountrySelector
                      id="kyc-origin-country"
                      value={kycCountry}
                      onChange={(val) => {
                        setKycCountry(val);
                        setKycCountryOfStay(val);
                      }}
                      placeholder="Select Country"
                    />
                  </div>

                  {/* City */}
                  <div className="group">
                    <label className="block text-xs font-black text-stone-500 uppercase tracking-widest pl-1 mb-2">
                      City / Location *
                    </label>
                    <input
                      required
                      type="text"
                      value={kycCity}
                      onChange={(e) => setKycCity(e.target.value)}
                      className="w-full bg-stone-50 border-none rounded-2xl p-4 text-xs font-bold text-stone-900 focus:ring-2 focus:ring-stone-900/10"
                      placeholder="e.g. Rawalpindi"
                    />
                  </div>

                  {/* Address */}
                  {kycCategory === "INDIVIDUAL" ? (
                    <div className="group md:col-span-2">
                      <label className="block text-xs font-black text-stone-500 uppercase tracking-widest pl-1 mb-2">
                        Residential Address (Mandatory) *
                      </label>
                      <input
                        required
                        type="text"
                        value={kycResidentialAddress}
                        onChange={(e) => setKycResidentialAddress(e.target.value)}
                        className="w-full bg-stone-50 border-none rounded-2xl p-4 text-xs font-bold text-stone-900 focus:ring-2 focus:ring-stone-900/10"
                        placeholder="Enter complete residential address as per Identity Document"
                      />
                    </div>
                  ) : (
                    <div className="group md:col-span-2">
                      <label className="block text-xs font-black text-stone-500 uppercase tracking-widest pl-1 mb-2">
                        {kycCategory === "FIRM_COMPANY" ? "Registered Office / Business Address (Mandatory) *" : "Business / Trading Address (Mandatory) *"}
                      </label>
                      <input
                        required
                        type="text"
                        value={kycBusinessAddress}
                        onChange={(e) => setKycBusinessAddress(e.target.value)}
                        className="w-full bg-stone-50 border-none rounded-2xl p-4 text-xs font-bold text-stone-900 focus:ring-2 focus:ring-stone-900/10"
                        placeholder="Enter complete office or business address"
                      />
                    </div>
                  )}
                </div>

                {/* FILE UPLOAD SECURITY CARDS */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
                  {/* ID Front card */}
                  <div className="space-y-3">
                    <span className="block text-xs font-black text-stone-500 uppercase tracking-widest pl-1">
                      {kycCategory === "FIRM_COMPANY"
                        ? "Representative ID Front Image *"
                        : "Identity Document Front Image *"}
                    </span>
                    <div className="border-2 border-dashed border-stone-200 rounded-2xl p-6 bg-stone-50/50 text-center relative flex flex-col items-center justify-center min-h-[160px] hover:border-amber-500 transition-all">
                      {kycFrontPhoto ? (
                        <div className="w-full space-y-3">
                          <div className="relative aspect-[16/10] max-w-xs mx-auto border-4 border-white shadow-xl rounded-xl overflow-hidden">
                            <img src={kycFrontPhoto} className="w-full h-full object-cover" alt="IDENTITY DOCUMENT FRONT PREVIEW" />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                              <span className="text-white text-xs uppercase font-black">Watermarked Securely</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setKycFrontPhoto("")}
                            className="text-xs font-black uppercase text-red-500 hover:text-red-700 active:scale-95 flex items-center gap-1 mx-auto"
                          >
                            <X className="w-3.5 h-3.5" /> Remove Image
                          </button>
                        </div>
                      ) : (
                        <label className="cursor-pointer space-y-2 flex flex-col items-center justify-center">
                          <div className="w-10 h-10 bg-amber-500/10 text-amber-600 rounded-xl flex items-center justify-center animate-pulse">
                            <Upload className="w-5 h-5" />
                          </div>
                          <div>
                            <span className="block text-xs font-black text-stone-800 uppercase tracking-wider">Upload Front Picture</span>
                            <span className="text-xs text-stone-400 uppercase font-black block mt-1">Required • Automatic Watermark</span>
                          </div>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleCnicUpload}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>
                  </div>

                  {/* ID Back card */}
                  <div className="space-y-3">
                    <span className="block text-xs font-black text-stone-500 uppercase tracking-widest pl-1">
                      {kycCategory === "FIRM_COMPANY"
                        ? "Representative ID Back Image (Optional)"
                        : "Identity Document Back Image (Optional)"}
                    </span>
                    <div className="border-2 border-dashed border-stone-200 rounded-2xl p-6 bg-stone-50/50 text-center relative flex flex-col items-center justify-center min-h-[160px] hover:border-amber-500 transition-all">
                      {kycBackPhoto ? (
                        <div className="w-full space-y-3">
                          <div className="relative aspect-[16/10] max-w-xs mx-auto border-4 border-white shadow-xl rounded-xl overflow-hidden">
                            <img src={kycBackPhoto} className="w-full h-full object-cover" alt="IDENTITY DOCUMENT BACK PREVIEW" />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                              <span className="text-white text-xs uppercase font-black">Watermarked Securely</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setKycBackPhoto("")}
                            className="text-xs font-black uppercase text-red-500 hover:text-red-700 active:scale-95 flex items-center gap-1 mx-auto"
                          >
                            <X className="w-3.5 h-3.5" /> Remove Image
                          </button>
                        </div>
                      ) : (
                        <label className="cursor-pointer space-y-2 flex flex-col items-center justify-center">
                          <div className="w-10 h-10 bg-stone-200/50 text-stone-600 rounded-xl flex items-center justify-center">
                            <Upload className="w-5 h-5" />
                          </div>
                          <div>
                            <span className="block text-xs font-black text-stone-800 uppercase tracking-wider">Upload Back Picture</span>
                            <span className="text-xs text-stone-400 uppercase font-black block mt-1">Optional • Watermarked</span>
                          </div>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleCnicBackUpload}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>
                  </div>

                  {/* Selfie card */}
                  <div className="space-y-3">
                    <span className="block text-xs font-black text-stone-500 uppercase tracking-widest pl-1">
                      {kycCategory === "FIRM_COMPANY"
                        ? "Representative Selfie Photo *"
                        : "Selfie Photograph *"}
                    </span>
                    <div className="border-2 border-dashed border-stone-200 rounded-2xl p-6 bg-stone-50/50 text-center relative flex flex-col items-center justify-center min-h-[160px] hover:border-amber-500 transition-all">
                      {kycSelfiePhoto ? (
                        <div className="w-full space-y-3">
                          <div className="relative aspect-[16/10] max-w-xs mx-auto border-4 border-white shadow-xl rounded-xl overflow-hidden">
                            <img src={kycSelfiePhoto} className="w-full h-full object-cover" alt="SELFIE PREVIEW" />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                              <span className="text-white text-xs uppercase font-black">Watermarked Securely</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setKycSelfiePhoto("")}
                            className="text-xs font-black uppercase text-red-500 hover:text-red-700 active:scale-95 flex items-center gap-1 mx-auto"
                          >
                            <X className="w-3.5 h-3.5" /> Remove Image
                          </button>
                        </div>
                      ) : (
                        <label className="cursor-pointer space-y-2 flex flex-col items-center justify-center">
                          <div className="w-10 h-10 bg-amber-500/10 text-amber-600 rounded-xl flex items-center justify-center animate-pulse">
                            <Upload className="w-5 h-5" />
                          </div>
                          <div>
                            <span className="block text-xs font-black text-stone-800 uppercase tracking-wider">Upload Face Selfie Photo</span>
                            <span className="text-xs text-stone-400 uppercase font-black block mt-1">Automatic Watermark</span>
                          </div>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleSelfieUpload}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>
                  </div>

                  {/* Business / Registration Doc Photo (For OWN_BUSINESS & FIRM_COMPANY) */}
                  {(kycCategory === "OWN_BUSINESS" || kycCategory === "BUSINESS" || kycCategory === "FIRM_COMPANY") && (
                    <div className="space-y-3">
                      <span className="block text-xs font-black text-stone-500 uppercase tracking-widest pl-1">
                        {kycCategory === "FIRM_COMPANY"
                          ? "Company Registration / Incorporation Certificate (Optional)"
                          : "Business License / Registration Doc (Optional)"}
                      </span>
                      <div className="border-2 border-dashed border-stone-200 rounded-2xl p-6 bg-stone-50/50 text-center relative flex flex-col items-center justify-center min-h-[160px] hover:border-amber-500 transition-all">
                        {kycBusinessDocPhoto ? (
                          <div className="w-full space-y-3">
                            <div className="relative aspect-[16/10] max-w-xs mx-auto border-4 border-white shadow-xl rounded-xl overflow-hidden">
                              <img src={kycBusinessDocPhoto} className="w-full h-full object-cover" alt="BUSINESS DOC PREVIEW" />
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                                <span className="text-white text-xs uppercase font-black">Watermarked Securely</span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setKycBusinessDocPhoto("")}
                              className="text-xs font-black uppercase text-red-500 hover:text-red-700 active:scale-95 flex items-center gap-1 mx-auto"
                            >
                              <X className="w-3.5 h-3.5" /> Remove Image
                            </button>
                          </div>
                        ) : (
                          <label className="cursor-pointer space-y-2 flex flex-col items-center justify-center">
                            <div className="w-10 h-10 bg-stone-200/50 text-stone-600 rounded-xl flex items-center justify-center">
                              <Upload className="w-5 h-5" />
                            </div>
                            <div>
                              <span className="block text-xs font-black text-stone-800 uppercase tracking-wider">Upload Document Photo</span>
                              <span className="text-xs text-stone-400 uppercase font-black block mt-1">Optional • Watermarked</span>
                            </div>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleBusinessDocUpload}
                              className="hidden"
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Representative Authority Letter (For FIRM_COMPANY) */}
                  {kycCategory === "FIRM_COMPANY" && (
                    <div className="space-y-3">
                      <span className="block text-xs font-black text-stone-500 uppercase tracking-widest pl-1">
                        Authority Letter / Board Resolution (Optional)
                      </span>
                      <div className="border-2 border-dashed border-stone-200 rounded-2xl p-6 bg-stone-50/50 text-center relative flex flex-col items-center justify-center min-h-[160px] hover:border-amber-500 transition-all">
                        {kycRepAuthorityLetter ? (
                          <div className="w-full space-y-3">
                            <div className="relative aspect-[16/10] max-w-xs mx-auto border-4 border-white shadow-xl rounded-xl overflow-hidden">
                              <img src={kycRepAuthorityLetter} className="w-full h-full object-cover" alt="AUTHORITY LETTER PREVIEW" />
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                                <span className="text-white text-xs uppercase font-black">Watermarked Securely</span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setKycRepAuthorityLetter("")}
                              className="text-xs font-black uppercase text-red-500 hover:text-red-700 active:scale-95 flex items-center gap-1 mx-auto"
                            >
                              <X className="w-3.5 h-3.5" /> Remove Image
                            </button>
                          </div>
                        ) : (
                          <label className="cursor-pointer space-y-2 flex flex-col items-center justify-center">
                            <div className="w-10 h-10 bg-stone-200/50 text-stone-600 rounded-xl flex items-center justify-center">
                              <Upload className="w-5 h-5" />
                            </div>
                            <div>
                              <span className="block text-xs font-black text-stone-800 uppercase tracking-wider">Upload Authorization Letter</span>
                              <span className="text-xs text-stone-400 uppercase font-black block mt-1">Optional • Watermarked</span>
                            </div>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleRepAuthorityLetterUpload}
                              className="hidden"
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Submitting indicator */}
                {watermarkingActive && (
                  <div className="p-3 bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold rounded-xl animate-pulse flex items-center gap-2 justify-center italic">
                    <RefreshCw className="w-4 h-4 animate-spin" /> Watermarking image & checking size limits...
                  </div>
                )}
                
                {/* Disclaimer */}
                <div className="p-4 bg-stone-50 border border-stone-200/50 rounded-xl italic font-medium text-stone-400 text-xs md:text-xs leading-relaxed">
                  🛡️ **A Zero-Trust Privacy Safeguard**: All uploaded documents are strictly layered with the "Uploaded to Avora" watermark, completely disabling potential external reuse.
                </div>

                {/* Terms and conditions checkbox */}
                <div className="flex items-start gap-3 p-4 bg-amber-500/5 rounded-2xl border border-amber-500/10">
                  <input
                    type="checkbox"
                    id="kyc-terms-checkbox"
                    checked={kycTermsAccepted}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setShowKycTermsModal(true);
                      } else {
                        setKycTermsAccepted(false);
                      }
                    }}
                    className="w-4 h-4 mt-0.5 rounded border-stone-300 text-stone-900 focus:ring-stone-900"
                  />
                  <label htmlFor="kyc-terms-checkbox" className="text-xs font-bold text-stone-700 cursor-pointer select-none leading-normal uppercase">
                    I accept the <span className="text-amber-600 underline">Terms & Conditions of KYC verification</span> *
                  </label>
                </div>

                {/* Actions */}
                <button
                  type="submit"
                  disabled={kycSubmitting || watermarkingActive}
                  className="w-full bg-stone-900 hover:bg-stone-800 text-white font-black py-4.5 rounded-2xl transition-all shadow-xl active:scale-95 disabled:opacity-50 uppercase tracking-[0.2em] text-xs italic flex items-center justify-center gap-2"
                >
                  {kycSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" /> Submitting Encrypted Application...
                    </>
                  ) : (
                    <>
                      <FileCheck className="w-4 h-4 text-emerald-400" /> {!kycTermsAccepted ? "Accept Terms & Submit" : "Submit KYC Request"}
                    </>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>
      )}

          {activeTab === "trust" && (
            <div className="space-y-8 animate-in fade-in duration-300">
              {/* Trust Score Overview Header */}
              <div className="bg-stone-900 text-white p-6 sm:p-8 rounded-[2rem] border border-stone-800 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/10 blur-3xl rounded-full pointer-events-none" />
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 relative z-10">
                  <div>
                    <span className="text-amber-500 font-black text-xs uppercase tracking-widest block mb-1">
                      Avora Trust Score Protocol
                    </span>
                    <h2 className="text-2xl sm:text-3xl font-black uppercase italic tracking-tighter text-white">
                      User Trust Ledger
                    </h2>
                    <p className="text-stone-400 text-xs font-medium mt-1 max-w-xl">
                      Your Trust Score (0–100) reflects your overall reliability across Avora. All score changes are permanently recorded in an immutable audit ledger.
                    </p>
                  </div>
                  <div className="bg-stone-950 p-5 rounded-2xl border border-stone-800 flex items-center gap-4 shrink-0 shadow-inner">
                    <TrustScoreBadge
                      trustScore={typeof profile?.trustScore === 'number' ? profile.trustScore : 50}
                      trustTier={profile?.trustTier}
                      size="lg"
                    />
                  </div>
                </div>

                {/* Score Progress Bar & Tier Scale */}
                <div className="mt-8 pt-6 border-t border-stone-800 space-y-3 relative z-10">
                  <div className="flex justify-between items-center text-xs font-black uppercase tracking-wider">
                    <span className="text-stone-400">Current Score Progress</span>
                    <span className="text-amber-400">{profile?.trustScore ?? 50} / 100</span>
                  </div>
                  <div className="w-full bg-stone-800 h-3 rounded-full overflow-hidden p-0.5 border border-stone-700">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        (profile?.trustScore ?? 50) >= 85 ? 'bg-emerald-500' :
                        (profile?.trustScore ?? 50) >= 65 ? 'bg-blue-500' :
                        (profile?.trustScore ?? 50) >= 40 ? 'bg-amber-500' :
                        (profile?.trustScore ?? 50) >= 20 ? 'bg-orange-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, profile?.trustScore ?? 50))}%` }}
                    />
                  </div>

                  {/* Tier Boundaries Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 text-[10px] font-bold uppercase tracking-wider text-stone-400 text-center">
                    <div className="p-2 bg-stone-950/60 rounded-xl border border-stone-800">
                      <span className="block text-red-400 font-black">High Risk</span>
                      0–19
                    </div>
                    <div className="p-2 bg-stone-950/60 rounded-xl border border-stone-800">
                      <span className="block text-orange-400 font-black">Caution / Low Trust</span>
                      20–39
                    </div>
                    <div className="p-2 bg-stone-950/60 rounded-xl border border-stone-800">
                      <span className="block text-amber-400 font-black">Neutral / Building</span>
                      40–64
                    </div>
                    <div className="p-2 bg-stone-950/60 rounded-xl border border-stone-800">
                      <span className="block text-blue-400 font-black">Established Trader</span>
                      65–84
                    </div>
                    <div className="p-2 bg-stone-950/60 rounded-xl border border-stone-800">
                      <span className="block text-emerald-400 font-black">Elite Reliable</span>
                      85–100
                    </div>
                  </div>
                </div>
              </div>

              {/* Immutable Trust History Timeline */}
              <div className="bg-white p-6 sm:p-8 rounded-[2rem] border border-stone-100 shadow-sm space-y-6">
                <div className="flex items-center justify-between border-b border-stone-100 pb-4">
                  <div>
                    <h3 className="text-lg font-black text-stone-900 uppercase italic tracking-tight flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-amber-500" /> Immutable Event Audit History
                    </h3>
                    <p className="text-stone-400 text-xs font-bold uppercase tracking-wider mt-0.5">
                      Cryptographically tracked score adjustment events
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (user?.uid) {
                        setTrustEventsLoading(true);
                        getUserTrustEvents(user.uid, 50)
                          .then(setTrustEvents)
                          .finally(() => setTrustEventsLoading(false));
                      }
                    }}
                    className="p-2 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-xl transition-all active:scale-95 cursor-pointer"
                    title="Refresh Ledger"
                  >
                    <RefreshCw className={`w-4 h-4 ${trustEventsLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                {trustEventsLoading ? (
                  <div className="py-12 text-center text-stone-400 font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-amber-500" /> Loading Trust Ledger...
                  </div>
                ) : trustEvents.length === 0 ? (
                  <div className="py-12 text-center bg-stone-50 rounded-2xl border border-stone-200 border-dashed space-y-2">
                    <Shield className="w-10 h-10 text-stone-300 mx-auto" />
                    <p className="text-xs font-black text-stone-600 uppercase tracking-wider">No Score Events Recorded</p>
                    <p className="text-[11px] text-stone-400 font-medium max-w-sm mx-auto">
                      Your account maintains the default starting Trust Score of 50. Future score events (e.g. KYC verification, dispute outcomes) will appear here automatically.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {trustEvents.map((evt, idx) => {
                      const delta = evt.scoreDelta;
                      const isPositive = delta > 0;
                      const isZero = delta === 0;
                      const dateStr = evt.createdAt 
                        ? (typeof (evt.createdAt as any).toDate === 'function' 
                            ? (evt.createdAt as any).toDate().toLocaleString() 
                            : new Date(evt.createdAt as any).toLocaleString())
                        : 'Recent';

                      return (
                        <div
                          key={evt.id || evt.deduplicationKey || idx}
                          className="p-5 rounded-2xl border border-stone-150 bg-stone-50/50 hover:border-amber-500/30 transition-all space-y-3"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <span className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${
                                isPositive 
                                  ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' 
                                  : isZero 
                                    ? 'bg-stone-200 text-stone-700' 
                                    : 'bg-red-100 text-red-700 border border-red-200'
                              }`}>
                                {isPositive ? `+${delta}` : delta}
                              </span>
                              <div>
                                <h4 className="font-black text-stone-900 text-xs sm:text-sm uppercase tracking-tight">
                                  {evt.eventType.replace(/_/g, ' ')}
                                </h4>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-stone-200 text-stone-700">
                                    {evt.sourceModule.replace(/_/g, ' ')}
                                  </span>
                                  <span className="text-[11px] text-stone-400 font-medium">{dateStr}</span>
                                </div>
                              </div>
                            </div>

                            <div className="text-right sm:self-center font-mono text-xs">
                              <span className="text-stone-400 font-bold">Score Shift: </span>
                              <span className="font-bold text-stone-600">{evt.previousScore}</span>
                              <span className="text-amber-600 font-black mx-1">→</span>
                              <span className="font-black text-stone-900 bg-amber-100/60 px-2 py-0.5 rounded-md border border-amber-200/50">
                                {evt.resultingScore}
                              </span>
                            </div>
                          </div>

                          {evt.reason && (
                            <p className="text-xs text-stone-600 font-medium bg-white p-3 rounded-xl border border-stone-200 italic">
                              "{evt.reason}"
                            </p>
                          )}

                          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-stone-200/60 text-[10px] text-stone-400 font-mono">
                            <span>Ref ID: <strong className="text-stone-600">{evt.relatedEntityId || 'N/A'}</strong></span>
                            <span className="truncate max-w-xs">Key: {evt.deduplicationKey}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

      {/* KYC TERMS AND CONDITIONS MODAL */}
      <AnimatePresence>
        {showKycTermsModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowKycTermsModal(false);
                setKycTermsAccepted(false);
              }}
              className="absolute inset-0 bg-stone-950/40 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl p-6 md:p-8 border-4 border-amber-100 overflow-hidden"
            >
              <div className="absolute -top-10 -right-10 w-28 h-28 bg-amber-500/5 rounded-full blur-2xl" />

              <div className="flex items-center gap-4 mb-6">
                <div className="w-11 h-11 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-stone-900 uppercase italic tracking-tighter text-lg leading-tight">KYC Terms & Conditions</h3>
                  <p className="text-xs text-amber-600 font-bold uppercase tracking-widest pl-0.5">Verification & Compliance Policy</p>
                </div>
              </div>

              <div className="space-y-4 text-xs text-stone-600 font-medium overflow-y-auto max-h-[40vh] pr-2 mb-6 uppercase">
                <p className="font-bold text-stone-900">Please review and confirm compliance with Avora policies:</p>
                <div className="p-3 bg-stone-50 rounded-xl border border-stone-100 leading-relaxed space-y-2 text-xs">
                  <p>1. 👤 **Identity Verification**: The applicant warrants that all uploaded National Identity Card/ Government Issue Document images and selfie are genuine, clear, and match the legal name entered.</p>
                  <p>2. 🔒 **Name Locking**: Upon approval, the seller's profile and marketplace name will be permanently locked to your Verified Name or Business Name. Direct renaming is prohibited to maintain trust.</p>
                  <p>3. ⚖️ **Compliance**: Fraudulent submissions, blurred or manipulated documentation will result in immediate rejection, potential account suspension, or permanent KYC removal.</p>
                  <p>4. 🛡️ **Zero-Trust Storage**: All documents are watermarked on processing and stored in encrypted form, solely used for trust & safety audits.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowKycTermsModal(false);
                    setKycTermsAccepted(false);
                  }}
                  className="flex-1 py-3 px-6 border border-stone-200 hover:bg-stone-50 rounded-xl text-stone-700 font-bold uppercase text-xs tracking-wider transition-all"
                >
                  Decline
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setKycTermsAccepted(true);
                    setShowKycTermsModal(false);
                  }}
                  className="flex-grow-[1.5] py-3 px-6 bg-amber-500 hover:bg-amber-600 text-stone-950 rounded-xl font-black uppercase text-xs tracking-wider transition-all shadow-sm"
                >
                  Confirm & Accept
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showUsernameModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowUsernameModal(false)}
              className="absolute inset-0 bg-stone-950/40 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 md:p-8 border-4 border-amber-100 overflow-hidden"
            >
              <div className="absolute -top-10 -right-10 w-28 h-28 bg-amber-500/5 rounded-full blur-2xl" />

              <div className="flex items-center gap-4 mb-6">
                <div className="w-11 h-11 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600">
                  <span className="font-black text-xl">@</span>
                </div>
                <div>
                  <h3 className="font-black text-stone-900 uppercase italic tracking-tighter text-lg leading-tight">Change Username</h3>
                  <p className="text-xs text-amber-600 font-bold uppercase tracking-widest pl-0.5">Unique Identifier</p>
                </div>
              </div>

              <form onSubmit={handleUsernameSubmit} className="space-y-4">
                {(() => {
                  const getCooldown = () => {
                    if (!profile?.lastUsernameChangedAt) return null;
                    const parseTime = (val: any) => {
                      if (!val) return null;
                      if (typeof val.toDate === "function") return val.toDate();
                      if (val.seconds) return new Date(val.seconds * 1000);
                      const d = new Date(val);
                      return !isNaN(d.getTime()) ? d : null;
                    };
                    const lastChanged = parseTime(profile.lastUsernameChangedAt);
                    if (!lastChanged) return null;
                    const diffMs = Date.now() - lastChanged.getTime();
                    const cooldownMs = 24 * 60 * 60 * 1000;
                    if (diffMs < cooldownMs) {
                      const remainingMs = cooldownMs - diffMs;
                      const remainingHours = Math.floor(remainingMs / (60 * 60 * 1000));
                      const remainingMinutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
                      return { remainingHours, remainingMinutes };
                    }
                    return null;
                  };
                  const cd = getCooldown();
                  if (!cd) return null;
                  return (
                    <div className="bg-red-50 border border-red-200 p-3 rounded-xl text-xs font-semibold text-red-800">
                      <p className="font-black uppercase tracking-wider text-red-900 mb-0.5">24-Hour Cooldown Active</p>
                      You cannot change your username yet. Remaining time: <span className="font-black">{cd.remainingHours} hours and {cd.remainingMinutes} minutes</span>.
                    </div>
                  );
                })()}

                <div className="group">
                  <label className="block text-xs font-black text-stone-400 uppercase tracking-widest mb-1 pl-1">New Username</label>
                  <input
                    type="text"
                    name="newUsername"
                    value={newUsernameInput}
                    onChange={(e) => setNewUsernameInput(e.target.value.replace(/\s+/g, ''))}
                    className="w-full bg-stone-50 border-stone-200/50 rounded-xl p-3 text-xs font-black text-stone-900 focus:ring-2 focus:ring-amber-500/20"
                    placeholder="Enter new username"
                  />
                  <p className="text-[10px] text-stone-400 font-bold mt-1.5 pl-1 leading-relaxed">
                    Must be unique. Allowed: letters, numbers, and symbols: $ - . _
                  </p>
                  {isKycVerified && (
                     <p className="text-[10px] text-amber-600 font-bold mt-1.5 pl-1 leading-relaxed bg-amber-50 p-2 rounded border border-amber-100">
                       As a KYC verified user, this will require admin approval.
                     </p>
                  )}
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowUsernameModal(false)}
                    className="flex-1 px-4 py-3 bg-stone-100 hover:bg-stone-200 text-stone-600 font-black text-xs uppercase tracking-widest rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={usernameChangeLoading || !newUsernameInput.trim()}
                    className="flex-1 px-4 py-3 bg-stone-900 hover:bg-stone-850 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {usernameChangeLoading ? (
                      <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    ) : (
                      "Submit"
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* VERIFIED NAME CHANGE REQUEST MODAL */}
      <AnimatePresence>
        {showNameChangeModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNameChangeModal(false)}
              className="absolute inset-0 bg-stone-950/40 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 md:p-8 border-4 border-amber-100 overflow-hidden"
            >
              <div className="absolute -top-10 -right-10 w-28 h-28 bg-amber-500/5 rounded-full blur-2xl" />

              <div className="flex items-center gap-4 mb-6">
                <div className="w-11 h-11 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600">
                  <Fingerprint className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-stone-900 uppercase italic tracking-tighter text-lg leading-tight">Request Identity Update</h3>
                  <p className="text-xs text-amber-600 font-bold uppercase tracking-widest pl-0.5">Admin approval gateway</p>
                </div>
              </div>

              <form onSubmit={handleNameChangeSubmit} className="space-y-4">
                {nameChangeMsg && (
                  <div className="p-3 bg-red-50 text-red-700 font-bold text-xs rounded-lg border border-red-100">
                    {nameChangeMsg}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 overflow-y-auto max-h-[50vh] pr-2">
                  {/* Real Name */}
                  <div className="group">
                    <label className="block text-xs font-black text-stone-400 uppercase tracking-widest mb-1 pl-1">New Real Name</label>
                    <input
                      type="text"
                      name="ncRealName"
                      value={nameChangeNewRealName}
                      onChange={(e) => setNameChangeNewRealName(e.target.value)}
                      className="w-full bg-stone-50 border-stone-200/50 rounded-xl p-3 text-xs font-black text-stone-900 focus:ring-2 focus:ring-amber-500/20 italic"
                      placeholder="Your full legal name"
                    />
                  </div>

                  {/* Business Name */}
                  <div className="group">
                    <label className="block text-xs font-black text-stone-400 uppercase tracking-widest mb-1 pl-1">New Business Name</label>
                    <input
                      type="text"
                      name="ncBusinessName"
                      value={nameChangeNewBusinessName}
                      onChange={(e) => setNameChangeNewBusinessName(e.target.value)}
                      className="w-full bg-stone-50 border-stone-200/50 rounded-xl p-3 text-xs font-black text-stone-900 focus:ring-2 focus:ring-amber-500/20 italic"
                      placeholder="Public shop/business name"
                    />
                  </div>

                  {/* Email */}
                  <div className="group">
                    <label className="block text-xs font-black text-stone-400 uppercase tracking-widest mb-1 pl-1">New Official Email</label>
                    <input
                      type="email"
                      name="ncEmail"
                      value={nameChangeNewEmail}
                      onChange={(e) => setNameChangeNewEmail(e.target.value)}
                      className="w-full bg-stone-50 border-stone-200/50 rounded-xl p-3 text-xs font-black text-stone-900 focus:ring-2 focus:ring-amber-500/20 italic"
                      placeholder="New contact email"
                    />
                  </div>

                  {/* CNIC Number */}
                  <div className="group">
                    <label className="block text-xs font-black text-stone-400 uppercase tracking-widest mb-1 pl-1">New National Identity Card/ Government Issue Document Number</label>
                    <input
                      type="text"
                      name="ncCnicNumber"
                      value={nameChangeNewCnicNumber}
                      onChange={(e) => setNameChangeNewCnicNumber(e.target.value)}
                      className="w-full bg-stone-50 border-stone-200/50 rounded-xl p-3 text-xs font-black text-stone-900 focus:ring-2 focus:ring-amber-500/20 italic"
                      placeholder="Enter new Document Number"
                    />
                  </div>

                  {/* Residential Address */}
                  {isIndividual && (
                    <div className="group">
                      <label className="block text-xs font-black text-stone-400 uppercase tracking-widest mb-1 pl-1">New Residential Address</label>
                      <input
                        type="text"
                        name="ncResidentialAddress"
                        value={nameChangeNewResidentialAddress}
                        onChange={(e) => setNameChangeNewResidentialAddress(e.target.value)}
                        className="w-full bg-stone-50 border-stone-200/50 rounded-xl p-3 text-xs font-black text-stone-900 focus:ring-2 focus:ring-amber-500/20 italic"
                        placeholder="New residential address"
                      />
                    </div>
                  )}

                  {/* Business Address */}
                  {isBusiness && (
                    <div className="group">
                      <label className="block text-xs font-black text-stone-400 uppercase tracking-widest mb-1 pl-1">New Business Address</label>
                      <input
                        type="text"
                        name="ncBusinessAddress"
                        value={nameChangeNewBusinessAddress}
                        onChange={(e) => setNameChangeNewBusinessAddress(e.target.value)}
                        className="w-full bg-stone-50 border-stone-200/50 rounded-xl p-3 text-xs font-black text-stone-900 focus:ring-2 focus:ring-amber-500/20 italic"
                        placeholder="New business address"
                      />
                    </div>
                  )}

                  {/* Reason */}
                  <div>
                    <label className="block text-xs font-black text-stone-400 uppercase tracking-widest mb-1 pl-1">Reason for Changes</label>
                    <textarea
                      required
                      rows={2}
                      value={nameChangeReason}
                      onChange={(e) => setNameChangeReason(e.target.value)}
                      className="w-full bg-stone-50 border-stone-200/50 rounded-xl p-3 text-xs font-medium text-stone-900 focus:ring-2 focus:ring-amber-500/20"
                      placeholder="Describe why you need these updates..."
                    />
                  </div>
                </div>

                <div className="bg-amber-50 p-3 rounded-lg border border-amber-100 text-xs text-amber-700 font-medium leading-normal italic">
                  💡 Due to KYC compliance locks, administrators will verify these changes against your active National Identity Card/ Government Issue Document or Business records before approval.
                </div>

                <div className="flex gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowNameChangeModal(false)}
                    className="flex-1 px-4 py-3 bg-stone-100 text-stone-400 font-black rounded-xl text-xs uppercase tracking-widest hover:bg-stone-250 transition-all border border-stone-200/50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={nameChangeSubmitting}
                    className="flex-2 px-6 py-3 bg-stone-900 text-white hover:bg-stone-800 font-black rounded-xl text-xs uppercase tracking-widest shadow-xl shadow-stone-900/10 active:scale-95 transition-all flex items-center justify-center gap-1.5"
                  >
                    {nameChangeSubmitting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Lodging Request...
                      </>
                    ) : (
                      <>
                        <UserCheck className="w-3.5 h-3.5 text-amber-500" /> Submit Request
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Profile KYC popup modal */}
      {showProfileKycPopup && (
        <div id="profile-kyc-popup" className="fixed inset-0 bg-stone-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[32px] border border-stone-200 shadow-2xl max-w-md w-full p-8 text-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-2 border-4 border-red-50">
              <ShieldCheck className="w-10 h-10" />
            </div>
            <h3 className="text-2xl font-black text-stone-900 uppercase italic tracking-tight">KYC Verification Needed</h3>
            <p className="text-stone-600 font-medium text-sm leading-relaxed">
              You are not KYC approved user so complete your KYC verification to get this badge.
            </p>
            <div className="flex gap-4 pt-2">
              <button
                id="profile-kyc-cancel-btn"
                onClick={() => setShowProfileKycPopup(false)}
                className="flex-1 py-3 px-6 border border-stone-200 hover:bg-stone-50 rounded-xl text-stone-700 font-bold uppercase text-xs tracking-wider transition-all"
              >
                Cancel
              </button>
              <button
                id="profile-kyc-complete-btn"
                onClick={() => {
                  setShowProfileKycPopup(false);
                  setActiveTab("kyc");
                }}
                className="flex-grow-[1.5] py-3 px-6 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold uppercase text-xs tracking-wider transition-all shadow-sm"
              >
                Complete KYC
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Zoom Lightbox for Listings */}
      {zoomedImage && (
        <KycImageLightbox
          src={zoomedImage}
          title={lightboxTitle || "Listing Image"}
          onClose={() => {
            setZoomedImage(null);
            setLightboxImages(undefined);
            setLightboxTitle("");
          }}
          images={lightboxImages}
        />
      )}
    </div>
  );
}
