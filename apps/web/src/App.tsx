function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl p-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Arda</h1>
        <p className="text-muted-foreground mb-8">
          Order management platform
        </p>

        {/* Primary color swatch */}
        <div className="flex gap-4 mb-8">
          <div className="flex flex-col items-center gap-2">
            <div className="w-16 h-16 rounded-md bg-primary" />
            <span className="text-xs text-muted-foreground">Primary</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="w-16 h-16 rounded-md bg-accent" />
            <span className="text-xs text-muted-foreground">Accent</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="w-16 h-16 rounded-md bg-destructive" />
            <span className="text-xs text-muted-foreground">Destructive</span>
          </div>
        </div>

        {/* Sample card */}
        <div className="card-arda p-6 mb-8">
          <h3 className="text-lg font-semibold mb-2">Order Queue Item</h3>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded bg-muted" />
            <div>
              <p className="font-semibold text-sm">
                <span className="link-arda">M8 x 1 - 50</span>
              </p>
              <p className="text-sm text-muted-foreground">2 pack of 25</p>
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button className="btn-arda-primary px-4 py-2 rounded-md text-sm font-medium">
            Add Item
          </button>
          <button className="btn-arda-secondary px-4 py-2 rounded-md text-sm font-medium border">
            Cancel
          </button>
          <button className="btn-arda-accent px-4 py-2 rounded-md text-sm font-medium">
            View Orders
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
