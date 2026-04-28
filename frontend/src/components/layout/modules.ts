import {
  KanbanSquare,
  LayoutDashboard,
  Radar,
  ShieldCheck,
  FileSearch,
  FileSignature,
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
    id: "inicio",
    label: null,
    modules: [
      {
        id: "inicio",
        code: "",
        label: "Inicio",
        href: "/dashboard",
        icon: LayoutDashboard,
        available: true,
      },
      {
        id: "tracker",
        code: "",
        label: "Seguimiento en vivo",
        href: "/tracker",
        icon: KanbanSquare,
        available: true,
      },
    ],
  },
  {
    id: "oportunidades",
    label: "Oportunidades",
    modules: [
      {
        id: "radar",
        code: "",
        label: "Radar",
        href: "/radar",
        icon: Radar,
        available: true,
      },
      {
        id: "pliegos",
        code: "",
        label: "Pliegos",
        href: "/pliegos",
        icon: FileSearch,
        available: true,
      },
    ],
  },
  {
    id: "preparar",
    label: "Preparar oferta",
    modules: [
      {
        id: "sobre-a",
        code: "",
        label: "Sobre A",
        href: "/sobre-a",
        icon: FileSignature,
        available: true,
      },
    ],
  },
  {
    id: "datos",
    label: "Mi empresa",
    modules: [
      {
        id: "empresa",
        code: "",
        label: "Empresa",
        href: "/empresa/perfil",
        icon: ShieldCheck,
        available: true,
      },
    ],
  },
];

export const MODULES: Module[] = MODULE_GROUPS.flatMap((g) => g.modules);
