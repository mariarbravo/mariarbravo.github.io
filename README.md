# Maria Bravo · Portfolio

**Live site: [mariarbravo.github.io](https://mariarbravo.github.io)**

My personal portfolio, built as an interactive 3D New York City skyline at night. Every project I've worked on is a real NYC landmark: click a building to fly to it and read about the project, or take the guided tour.

I'm a Software Engineering student at the University of Arizona (B.S. May 2027, accelerated M.S. in Electrical and Computer Engineering May 2028).

## The skyline

| Landmark | Project |
| --- | --- |
| Madison Square Garden | Event Management System (Spring Boot, React, PostgreSQL) |
| Empire State Building | Nutrition Assistant (Python, Streamlit, OpenAI API, AWS RDS) |
| 30 Hudson Yards · The Edge | AI forecasting for Digital Twins (research, Chronos-2) |
| One Vanderbilt | Senior capstone: physics algorithms for optical simulation |
| One World Trade Center | Social Network Graph Analyzer (C++) |
| Chrysler Building | Game of Trains (C) |
| Flatiron Building | FPGA Ping-Pong Game (Verilog) |
| 432 Park Avenue | SRS documentation, 1st place (UML, Enterprise Architect) |
| Woolworth Building | Accounting PDF data extraction |
| Citigroup Center | This website |

## Features

- **Interactive 3D city.** Drag to look around (swipe on phones), and hover or tap a building to see its project.
- **Guided tour.** A fly-through of every landmark with on-screen captions that introduce each project.
- **Quick view for recruiters.** Below the skyline is a plain, fast layout with About, Experience, Projects, Résumé and Contact, all reachable from the top bar.
- **Made in code.** The buildings, lit windows, traffic, Brooklyn Bridge, and Statue of Liberty are all generated with JavaScript and custom shaders. There are no 3D model files to download.
- **Works everywhere.** A lighter version runs on phones, devices without WebGL get a flat skyline, and motion is reduced for visitors who prefer it.

## Built with

- HTML, CSS, and JavaScript (no build step)
- [Three.js](https://threejs.org/) for the 3D rendering, with custom GLSL shaders for the windows and lights
- [Formspree](https://formspree.io/) for the contact form
- Hosted for free on GitHub Pages

## Project structure

```
index.html    Main page: skyline, about, experience, projects, résumé, contact
city.js       The 3D city, landmarks, camera controls and guided tour
site.css      All styles
pandas.html   Nutrition Assistant demo video
Resume.pdf    Current résumé
```

The old `about.html`, `projects.html`, `resume.html` and `contact.html` pages redirect to the matching section of the main page.

## Contact

- Email: [mariapauruizb@gmail.com](mailto:mariapauruizb@gmail.com)
- LinkedIn: [linkedin.com/in/mariarbravo](https://www.linkedin.com/in/mariarbravo)
- GitHub: [@mariarbravo](https://github.com/mariarbravo)
