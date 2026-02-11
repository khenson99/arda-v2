# Design System Configuration Reference

The design system config lives at `.ralph-team/design-system.json` and is created
by `init.sh` for frontend and monorepo projects. It's maintained by the Design
Enforcer agent and consumed by the Frontend Engineer.

---

## Full Schema

```json
{
  "tokens": {
    "colors": {
      "primary": { "50": "#eff6ff", "500": "#3b82f6", "900": "#1e3a5f" },
      "secondary": { "50": "#f0fdf4", "500": "#22c55e", "900": "#14532d" },
      "neutral": { "0": "#ffffff", "50": "#f9fafb", "100": "#f3f4f6", "900": "#111827" },
      "error": "#ef4444",
      "warning": "#f59e0b",
      "success": "#22c55e",
      "info": "#3b82f6"
    },
    "spacing": {
      "unit": 4,
      "scale": [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64],
      "note": "Values are multiplied by unit (4px). So spacing-4 = 16px."
    },
    "typography": {
      "font_family": {
        "sans": "Inter, system-ui, sans-serif",
        "mono": "JetBrains Mono, Fira Code, monospace"
      },
      "font_size": {
        "xs": "0.75rem",
        "sm": "0.875rem",
        "base": "1rem",
        "lg": "1.125rem",
        "xl": "1.25rem",
        "2xl": "1.5rem",
        "3xl": "1.875rem",
        "4xl": "2.25rem"
      },
      "font_weight": {
        "normal": 400,
        "medium": 500,
        "semibold": 600,
        "bold": 700
      },
      "line_height": {
        "tight": 1.25,
        "normal": 1.5,
        "relaxed": 1.75
      }
    },
    "radii": {
      "none": "0",
      "sm": "0.25rem",
      "md": "0.375rem",
      "lg": "0.5rem",
      "xl": "0.75rem",
      "2xl": "1rem",
      "full": "9999px"
    },
    "shadows": {
      "sm": "0 1px 2px 0 rgb(0 0 0 / 0.05)",
      "md": "0 4px 6px -1px rgb(0 0 0 / 0.1)",
      "lg": "0 10px 15px -3px rgb(0 0 0 / 0.1)",
      "xl": "0 20px 25px -5px rgb(0 0 0 / 0.1)"
    },
    "breakpoints": {
      "sm": "640px",
      "md": "768px",
      "lg": "1024px",
      "xl": "1280px",
      "2xl": "1536px"
    },
    "z_index": {
      "dropdown": 1000,
      "sticky": 1020,
      "fixed": 1030,
      "modal_backdrop": 1040,
      "modal": 1050,
      "popover": 1060,
      "tooltip": 1070,
      "toast": 1080
    }
  },
  "components": {
    "inventory": [
      {
        "name": "Button",
        "path": "components/ui/Button",
        "variants": ["primary", "secondary", "ghost", "danger"],
        "sizes": ["sm", "md", "lg"],
        "props": ["variant", "size", "disabled", "loading", "icon", "children"]
      },
      {
        "name": "Input",
        "path": "components/ui/Input",
        "variants": ["default", "error"],
        "sizes": ["sm", "md", "lg"],
        "props": ["label", "error", "helperText", "disabled", "placeholder"]
      }
    ],
    "naming_conventions": {
      "component_files": "PascalCase.tsx",
      "style_files": "component-name.module.css OR use Tailwind classes",
      "test_files": "ComponentName.test.tsx",
      "story_files": "ComponentName.stories.tsx",
      "hook_files": "use-hook-name.ts"
    }
  },
  "patterns": {
    "layout": {
      "max_content_width": "1280px",
      "page_padding": "spacing-6 on mobile, spacing-8 on desktop",
      "section_gap": "spacing-16"
    },
    "forms": {
      "label_position": "top",
      "error_display": "below input",
      "required_indicator": "asterisk after label",
      "validation": "on blur + on submit"
    },
    "modals": {
      "backdrop": "neutral-900/50",
      "max_width": "lg: 32rem, xl: 48rem",
      "padding": "spacing-6",
      "close_button": "top-right, icon only"
    },
    "tables": {
      "striped": false,
      "hover_row": true,
      "sticky_header": true,
      "border": "bottom only"
    }
  },
  "accessibility": {
    "min_contrast_ratio": 4.5,
    "focus_visible_style": "2px solid primary-500, 2px offset",
    "required_aria": [
      "All interactive elements must have accessible names",
      "Images must have alt text (decorative: alt='')",
      "Form inputs must have associated labels",
      "Modals must trap focus",
      "Dynamic content changes must use aria-live"
    ],
    "keyboard_navigation": [
      "All interactive elements reachable via Tab",
      "Escape closes modals/dropdowns",
      "Arrow keys navigate within composite widgets",
      "Enter/Space activate buttons"
    ]
  },
  "forbidden": [
    "Do not use hardcoded color hex values — use tokens",
    "Do not use hardcoded pixel values for spacing — use spacing scale",
    "Do not use inline styles for layout",
    "Do not create new base components without Architect approval",
    "Do not use !important",
    "Do not use z-index values outside the defined scale",
    "Do not use generic div for interactive elements — use semantic HTML"
  ]
}
```

---

## How Agents Use This Config

### Frontend Engineer
- Imports components from inventory paths before creating new ones
- Uses tokens for all visual properties
- Follows naming conventions for new files
- Applies patterns for layout/forms/modals
- Checks `forbidden` list before committing

### Design Enforcer
- Validates PR diffs against this schema
- Flags hardcoded values that should use tokens
- Checks component inventory for duplicates
- Verifies accessibility requirements
- Reports violations as PR review comments

### Architect
- Approves additions to component inventory
- Updates tokens when design changes are needed
- Adds new patterns as architecture evolves

---

## Customization

The default config is generated by `init.sh` based on detected stack. To customize:

1. Edit `.ralph-team/design-system.json` directly
2. Or create a `design-system.override.json` that gets deep-merged

The Design Enforcer agent will always use the merged result.

### Tailwind Projects

For Tailwind projects, tokens should mirror your `tailwind.config.js`:

```json
{
  "tokens": {
    "note": "These tokens map 1:1 to tailwind.config.js theme extensions",
    "colors": "See theme.extend.colors in tailwind.config.js"
  }
}
```

### CSS Modules / Styled Components

For non-Tailwind projects, tokens should be defined as CSS custom properties
or styled-components theme:

```json
{
  "tokens": {
    "implementation": "css-custom-properties",
    "file": "styles/tokens.css",
    "note": "All tokens are defined as --token-name in tokens.css"
  }
}
```
