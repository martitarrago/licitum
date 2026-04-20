import {
  LayoutDashboard,
  Radar,
  ShieldCheck,
  Calculator,
  FileText,
  Target,
  FileSignature,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

export interface SubModule {
  label: string;
  href: string;
}

export interface Module {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  available: boolean;
  children?: SubModule[];
}

export const MODULES: Module[] = [
  {
    id: "m1",
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    available: false,
  },
  {
    id: "m2",
    label: "Radar IA",
    href: "/radar",
    icon: Radar,
    available: false,
  },
  {
    id: "m3",
    label: "Solvencia",
    href: "/solvencia",
    icon: ShieldCheck,
    available: true,
    children: [
      { label: "Certificados", href: "/solvencia/certificados" },
      { label: "Clasificaciones", href: "/solvencia/clasificaciones" },
    ],
  },
  {
    id: "m4",
    label: "Estudio BC3",
    href: "/bc3",
    icon: Calculator,
    available: false,
  },
  {
    id: "m5",
    label: "Memorias",
    href: "/memorias",
    icon: FileText,
    available: false,
  },
  {
    id: "m6",
    label: "Competencia",
    href: "/competencia",
    icon: Target,
    available: false,
  },
  {
    id: "m7",
    label: "Administración",
    href: "/admin",
    icon: FileSignature,
    available: false,
  },
  {
    id: "m8",
    label: "Histórico",
    href: "/historico",
    icon: TrendingUp,
    available: false,
  },
];
