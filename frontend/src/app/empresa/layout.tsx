export default function EmpresaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Cada subsección de empresa (identidad / solvencia / recursos / docs /
  // preferencias) es una entrada independiente del sidebar y trae su propio
  // header. Aquí solo el contenedor para que el contenido respire.
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      {children}
    </div>
  );
}
