export default function PreferenciasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="animate-fade-up">
      <header className="mb-6">
        <h1 className="display-h text-3xl leading-[1.05] sm:text-4xl">
          preferencias
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Lo que te interesa y lo que aceptas. Mezcla hard filters (capacidad,
          presupuesto, estado de aceptación) y soft (territorios, CPVs). Lo
          declaras tú — no se deduce de tus certificados ni del histórico PSCP.
        </p>
      </header>
      {children}
    </div>
  );
}
