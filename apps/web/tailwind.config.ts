import tailwindcssAnimate from "tailwindcss-animate";
import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        link: "hsl(var(--link))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
          muted: "hsl(var(--sidebar-muted))",
        },
        // Arda brand colors with extended palette
        arda: {
          orange: {
            DEFAULT: "hsl(var(--arda-orange))",
            hover: "hsl(var(--arda-orange-hover))",
            light: "hsl(var(--arda-orange-light))",
            50: "hsl(var(--arda-orange-50))",
            100: "hsl(var(--arda-orange-100))",
            200: "hsl(var(--arda-orange-200))",
            300: "hsl(var(--arda-orange-300))",
            400: "hsl(var(--arda-orange-400))",
            500: "hsl(var(--arda-orange-500))",
            600: "hsl(var(--arda-orange-600))",
            700: "hsl(var(--arda-orange-700))",
            800: "hsl(var(--arda-orange-800))",
            900: "hsl(var(--arda-orange-900))",
          },
          blue: {
            DEFAULT: "hsl(var(--arda-blue))",
            hover: "hsl(var(--arda-blue-hover))",
            light: "hsl(var(--arda-blue-light))",
            50: "hsl(var(--arda-blue-50))",
            100: "hsl(var(--arda-blue-100))",
            200: "hsl(var(--arda-blue-200))",
            300: "hsl(var(--arda-blue-300))",
            400: "hsl(var(--arda-blue-400))",
            500: "hsl(var(--arda-blue-500))",
            600: "hsl(var(--arda-blue-600))",
            700: "hsl(var(--arda-blue-700))",
            800: "hsl(var(--arda-blue-800))",
            900: "hsl(var(--arda-blue-900))",
          },
          success: {
            DEFAULT: "hsl(var(--arda-success))",
            light: "hsl(var(--arda-success-light))",
          },
          warning: {
            DEFAULT: "hsl(var(--arda-warning))",
            light: "hsl(var(--arda-warning-light))",
          },
          error: {
            DEFAULT: "hsl(var(--arda-error))",
            light: "hsl(var(--arda-error-light))",
          },
          info: {
            DEFAULT: "hsl(var(--arda-info))",
            light: "hsl(var(--arda-info-light))",
          },
        },
        // Table-specific colors
        table: {
          header: "hsl(var(--table-header-bg))",
          "row-hover": "hsl(var(--table-row-hover))",
          border: "hsl(var(--table-border))",
          link: "hsl(var(--table-link))",
        },
      },
      fontFamily: {
        sans: ["Open Sans", "system-ui", "-apple-system", "sans-serif"],
        display: ["Open Sans", "system-ui", "sans-serif"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "14px",
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
        "arda-sm": "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
        "arda-md": "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
        "arda-lg": "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
        "arda-xl": "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
        "arda-orange": "0 4px 14px 0 hsla(14, 93%, 57%, 0.25)",
        "arda-blue": "0 4px 14px 0 hsla(216, 94%, 50%, 0.25)",
        "inner-sm": "inset 0 1px 2px 0 rgba(0, 0, 0, 0.05)",
      },
      backdropBlur: {
        xs: "2px",
      },
      spacing: {
        row: "var(--row-height)",
        cell: "var(--cell-padding)",
        unit: "var(--spacing-unit)",
      },
      fontSize: {
        density: "var(--font-size-base)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        "slide-in-left": {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(0)" },
        },
        "scale-in": {
          from: { transform: "scale(0.95)", opacity: "0" },
          to: { transform: "scale(1)", opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-1000px 0" },
          "100%": { backgroundPosition: "1000px 0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.2s ease-out",
        "slide-in-right": "slide-in-right 0.3s ease-out",
        "slide-in-left": "slide-in-left 0.3s ease-out",
        "scale-in": "scale-in 0.2s ease-out",
        shimmer: "shimmer 2s linear infinite",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
