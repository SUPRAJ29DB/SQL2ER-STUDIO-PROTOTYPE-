# SQL2ER Studio Prototype

SQL2ER Studio is a lightweight, browser-based tool that turns SQL table definitions into an interactive entity-relationship (ER) diagram. It also checks common schema design issues and explains tables, keys, relationships, and normalization concepts in plain language.

## Features

- Parse SQL `CREATE TABLE` statements
- Parse `ALTER TABLE ... ADD FOREIGN KEY` relationships
- Render tables and foreign-key relationships as an SVG ER diagram
- Drag tables to rearrange the diagram
- Highlight primary keys, foreign keys, and junction tables
- Detect common schema design issues
- Explain tables, cardinality, primary keys, foreign keys, junction tables, and normalization
- Includes university and flawed-schema examples
- Responsive layout with light and dark color-scheme support
- Runs entirely in the browser with no backend or build step

## Getting started

### Use the hosted version

Open the repository with GitHub Pages if it is enabled for the project:

<https://supraj29db.github.io/SQL2ER-STUDIO-PROTOTYPE-/>

### Run locally

Clone the repository and open `index.html` in a modern web browser:

```bash
git clone https://github.com/SUPRAJ29DB/SQL2ER-STUDIO-PROTOTYPE-.git
cd SQL2ER-STUDIO-PROTOTYPE-
```

You can also serve the files with any static HTTP server, for example:

```bash
python3 -m http.server
```

Then visit <http://localhost:8000>.

## Usage

1. Paste your SQL schema into the **SQL schema** editor.
2. Select **Generate diagram**.
3. Review the ER diagram and the **Design check** results.
4. Select a table or relationship to read its explanation.
5. Use the learning assistant for schema overviews, improvement suggestions, and database-design terminology.

The **University sample** and **Flawed sample** buttons provide ready-to-run examples.

## Supported SQL

The prototype currently focuses on table definitions and foreign-key relationships. It supports patterns such as:

```sql
CREATE TABLE departments (
  department_id INT PRIMARY KEY,
  name VARCHAR(100) NOT NULL
);

CREATE TABLE students (
  student_id INT PRIMARY KEY,
  department_id INT,
  FOREIGN KEY (department_id) REFERENCES departments(department_id)
);
```

Foreign keys declared separately are also supported:

```sql
ALTER TABLE students
  ADD FOREIGN KEY (department_id)
  REFERENCES departments(department_id);
```

SQL parsing is intentionally limited to the syntax needed for this prototype; it is not a complete database-dialect parser.

## Project structure

| File | Purpose |
| --- | --- |
| `index.html` | Application layout and interface markup |
| `script.js` | SQL parsing, analysis, diagram rendering, and learning assistant logic |
| `style.css` | Responsive layout, colors, typography, and diagram styles |

## Technology

- HTML5
- CSS3
- Vanilla JavaScript
- SVG for diagram rendering
- IBM Plex Sans and IBM Plex Mono fonts loaded from Google Fonts

No package manager, framework, or server is required.

## Limitations

- Designed for prototyping and learning rather than production schema validation
- SQL support is syntax-focused and may not cover every database dialect
- Diagram positions are maintained in the current browser session and are not persisted
- Analysis rules are heuristic checks, not a replacement for a database engine or migration tool

## License

No license has been specified yet.
<img width="1888" height="980" alt="image" src="https://github.com/user-attachments/assets/9ca6e784-65b2-41d8-9062-36ac8f81dcbf" />

