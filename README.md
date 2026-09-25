# Bezmos

Bezmos is a Chrome extension for creating and manipulating shapes directly in Desmos.

The idea started with a much smaller problem: I like using Desmos to make art.

## Download

**[Download the latest release](https://github.com/Aariz-Ahmad/bezmos/releases/latest)**

Bezmos 1.2 is the first official release and includes the current drawing toolset: lines, Bézier curves, polygons, and ovals.

## Where it started

I started making graphs that looked like things using the usual lines, parabolas, cubics, and other functions. Eventually, I wanted more control over the shapes I could make, so I started experimenting with my own equations.

One of the first things I worked on was a general equation for an oval. I wanted an oval that could be positioned and rotated however I wanted.

A big part of figuring that out came from [RedBeanieMaths](https://www.youtube.com/@RedBeanieMaths), whose work helped me understand how graphs can be rotated using sine and cosine. Once I had a rotatable oval, I realized that Desmos's parameter restrictions could be used to cut the graph down and create arbitrary curves.

That was my first real step beyond the standard functions.

Then I tried to make my own version of what are known as Bézier curves.

I ended up independently stumbling across the **de Casteljau algorithm**: repeatedly interpolating between points, then interpolating between those interpolations, until a single point remained. I later looked it up and discovered that the thing I had been experimenting with was a real and widely-used way of constructing Bézier curves.

The math worked.

The problem was the equations.

A Bézier curve with several control points can turn into a huge expression. Unlike my oval equation, where I could set up a few variables and replace them when I was finished, manually substituting every coordinate into a large Bézier expression was ridiculous.

So I made a tool to do it for me.

## What Bezmos does

Bezmos lets you create shapes interactively and turn those constructions into actual Desmos expressions.

The current toolset includes:

* **Lines** for creating line segments
* **Bézier Curves** for creating smooth cubic curves
* **Custom Bézier Curves** for curves with a variable number of control points
* **Polygons** for creating multi-sided shapes
* **Ovals** with rotation and independent width and height controls

Bezmos also provides construction guides to make positioning and editing shapes easier, along with options for hiding those guides once they're no longer needed.

The long-term idea is to make it possible to create essentially anything that can be represented mathematically in Desmos, without requiring the user to manually construct enormous expressions.

There are already many impressive examples of mathematical art made in Desmos. I wanted to make the process more interactive, user-friendly, and accessible, rather than requiring people to build everything by hand.

## How it works

Bezmos runs as a Chrome extension and interacts directly with the Desmos calculator.

`inject.js` communicates with the Desmos calculator and handles much of the mathematical construction. `isolated.js` handles the extension interface and user interaction, while `templates.js` contains the mathematical templates used to construct shapes. `popup.html` controls the Chrome extension popup and `manifest.json` contains the extension configuration.

A lot of the shapes are built using temporary expressions while the user is working on them. Once the construction is finished, Bezmos can read the values from those expressions, substitute them into the final equation, and remove the temporary scaffolding.

This is particularly useful for Bézier curves, where manually substituting every control point into the final equation can become extremely tedious.

Bezmos also uses Desmos `HelperExpression`s for some interactive shape manipulation.

## Why I made it

Mostly because I wanted it.

I spend a lot of time messing around in Desmos, and I like making graphs that look like actual drawings. Bezmos grew naturally out of that.

Every time I ran into something that was possible mathematically but annoying to do in Desmos, I tried to find a way around it.

Eventually, those solutions started turning into a tool.

## Current status

Bezmos is still actively being developed.

The current release is **1.2**, the first official release of the project.

Some features are still experimental and there are known bugs. In particular, the **Fill Tool is currently broken** and should not be expected to work reliably. It remains in the project for future development, but it is not part of the functional current toolset.

The current functional toolset is:

**Lines · Bézier Curves · Polygons · Ovals**

Custom Bézier curves are also available through the Bézier tool for more complex curves.

## Installation

Download the latest release, or clone the repository if you want to use the development version.

To install Bezmos manually, open `chrome://extensions` in Chrome, enable **Developer mode**, click **Load unpacked**, and select the `Bezmos` folder.

Open Desmos and the extension should be available.

## A note on AI

AI tools were used in a small part of the development of Bezmos.

I primarily used them as a programming reference when I got stuck, rather than to generate the project as a whole. In particular, I used AI to help me figure out how to create the custom SVG icons, work with a few tricky Desmos and browser APIs, and implement the `HelperExpression` setup used for some of the interactive shape manipulation.

The mathematics, overall design, feature ideas, and most of the implementation were developed by me. AI-generated suggestions were tested, modified, and integrated where they actually worked for the project.

## Roadmap

Bezmos is still pretty early, so I don't have a strict roadmap. Right now I'm mainly working on improving the fill tool, adding more shape types, making manipulation easier, and figuring out how far I can push the idea of creating things in Desmos.

More will come as I build it.

---

Built by [Aariz Ahmad](https://github.com/Aariz-Ahmad).
