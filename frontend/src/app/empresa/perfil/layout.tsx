export default function PerfilLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="animate-fade-up">
      <header className="mb-6">
        <h1 className="display-h text-3xl leading-[1.05] sm:text-4xl">
          empresa
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Datos identificativos, dirección, representante legal, poder notarial,
          Seguridad Social y volumen de negocio (cuentas anuales). Alimentan el
          DEUC del Sobre A y la solvencia económica declarada en cada licitación.
        </p>
      </header>
      {children}
    </div>
  );
}
