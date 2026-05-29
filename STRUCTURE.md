# Website Directory Structure

This document describes the organized structure of the Self-Evolving Agents research showcase website.

## 📁 Directory Layout

```
website-sea/
├── index.html                          # Main landing page
├── README.md                          # Project README
├── STRUCTURE.md                       # This file
│
├── shared/                            # Shared assets across all papers
│   ├── css/
│   │   ├── styles.css                # Global styles for paper pages
│   │   └── index-styles.css          # Styles for landing page
│   ├── js/
│   │   ├── script.js                 # JavaScript for paper pages
│   │   └── index-script.js           # JavaScript for landing page
│   └── authors/                      # Author photos (shared across papers)
│       ├── ye_liu.png
│       ├── srijan_bansal.png
│       ├── bo_pang.png
│       └── ... (9 total)
│
└── papers/                            # Individual paper directories
    └── pmd/                          # Procedural Memory Distillation
        ├── index.html                # Paper presentation page
        ├── Procedural_Memory_Distillation.pdf
        └── images/                   # PMD-specific figures
            ├── pmd_main_figure.png
            ├── training_dynamics.png
            ├── internalization_all.png
            ├── coverage_passk_combined.png
            └── ... (15 total figures)
```

## 🎯 Design Principles

### 1. **Separation of Concerns**
- **Shared resources** (`shared/`) - Assets used across multiple papers (CSS, JS, author photos)
- **Paper-specific resources** (`papers/<paper-name>/`) - Everything related to a single paper

### 2. **Scalability**
- Easy to add new papers: create a new directory under `papers/`
- Each paper is self-contained with its own images and PDF
- Shared styles ensure consistency

### 3. **Clean URLs**
- Landing page: `index.html`
- PMD paper: `papers/pmd/` (automatically serves `index.html`)
- Future papers: `papers/<new-paper>/`

## 📝 Adding a New Paper

To add a new research paper to the collection:

1. **Create paper directory**:
   ```bash
   mkdir -p papers/<paper-name>/{images,css,js}
   ```

2. **Add paper files**:
   - Create `papers/<paper-name>/index.html` (copy from `papers/pmd/index.html` as template)
   - Add PDF: `papers/<paper-name>/<paper-name>.pdf`
   - Add figures: `papers/<paper-name>/images/`

3. **Update landing page**:
   - Add a new paper card in `index.html` under "Featured Research" section
   - Link to `papers/<paper-name>/`

4. **Use shared resources**:
   - Link to `../../shared/css/styles.css` for consistent styling
   - Link to `../../shared/js/script.js` for consistent behavior
   - Reference author photos from `../../shared/authors/`

## 🎨 Asset Organization

### Shared Assets
- **CSS**: Global styles that apply to all papers
- **JS**: Common interactive features
- **Authors**: Reusable author photos across papers

### Paper-Specific Assets
- **Images**: Research figures, diagrams, charts specific to that paper
- **PDF**: The actual research paper PDF
- **Custom CSS/JS** (optional): Paper-specific styling or behavior

## 🔗 Path References

### From Landing Page (`index.html`)
- Shared CSS: `shared/css/`
- Shared JS: `shared/js/`
- Shared authors: `shared/authors/`
- Paper links: `papers/<paper-name>/`

### From Paper Page (`papers/pmd/index.html`)
- Shared CSS: `../../shared/css/`
- Shared JS: `../../shared/js/`
- Shared authors: `../../shared/authors/`
- Paper images: `images/`
- Paper PDF: `./<paper-name>.pdf`
- Back to landing: `../../index.html`

## 🚀 Benefits

1. **Easy maintenance** - Each paper's assets are isolated
2. **Consistent styling** - Shared CSS ensures uniform look
3. **Scalable** - Add new papers without touching existing ones
4. **Clear organization** - Easy to find and update assets
5. **No duplication** - Shared resources used across papers
