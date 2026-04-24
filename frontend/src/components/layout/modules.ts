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
  code: string;
  label: string;
  href: string;
  icon: LucideIcon;
  available: boolean;
  children?: SubModule[];
}

export interface ModuleGroup {
  id: string;
  label: string | null;
  modules: Module[];
}

export const MODULE_GROUPS: ModuleGroup[] = [
  {
    id: "resumen",
    label: null,
    modules: [
      {
        id: "m1",
        code: "",
        label: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        available: true,
      },
    ],
  },
  {
    id: "oportunidades",
    label: "Oportunidades",
    modules: [
      {
        id: "m2",
        code: "M2",
        label: "Radar IA",
        href: "/radar",
        icon: Radar,
        available: false,
      },
      {
        id: "m3",
        code: "",
        label: "Solvencia",
        href: "/solvencia",
        icon: ShieldCheck,
        available: true,
        children: [
          { label: "Certificados", href: "/solvencia/certificados" },
          { label: "Clasificaciones", href: "/solvencia/clasificaciones" },
        ],
      },
    ],
  },
  {
    id: "preparar",
    label: "Preparar oferta",
    modules: [
      {
        id: "m4",
        code: "M4",
        label: "Estudio BC3",
        href: "/bc3",
        icon: Calculator,
        available: false,
      },
      {
        id: "m5",
        code: "M5",
        label: "Memorias",
        href: "/memorias",
        icon: FileText,
        available: false,
      },
      {
        id: "m6",
        code: "M6",
        label: "Competencia",
        href: "/competencia",
        icon: Target,
        available: false,
      },
      {
        id: "m7",
        code: "M7",
        label: "Administración",
        href: "/admin",
        icon: FileSignature,
        available: false,
      },
    ],
  },
  {
    id: "aprender",
    label: "Aprender",
    modules: [
      {
        id: "m8",
        code: "M8",
        label: "Histórico",
        href: "/historico",
        icon: TrendingUp,
        available: false,
      },
    ],
  },
];

export const MODULES: Module[] = MODULE_GROUPS.flatMap((g) => g.modules);
