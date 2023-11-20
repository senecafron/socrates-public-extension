<img src="https://i.ibb.co/1dKqpwg/Logo.png" alt="Socrates Logo" width="204" height="55">
# Welcome to the Socrates Extension!

We're thrilled to have you on board with the (soon to be)  world's best code navigator, Socrates. With Socrates, you'll be able to navigate your codebase with ease, visualizing how functions and variables are connected with one another on an infinite canvas, just like a map!

To install the Socrates extension, follow these steps:

1. Clone or download this repository.
1. Open Visual Studio Code.
1. Navigate to the `Extensions view` by clicking on the icon that looks like four blocks, with one block detached from the rest
1. Click on the three-dot icon located at the top right.
1. Choose "Install from VSIX..."
1. Locate the `socrates-0.0.1.vsix` file in the repository that you just cloned or downloaded.

Another step that you need to do is to install `typescript-language-server` by running:

```
npm install -g typescript-language-server typescript
```

You might have to prepend the command above with `sudo` if you encounter a permission issue.

## Running Socrates on the demo project (`socrates-demo-repo` folder)

Once you have Socrates installed in your VS Code, please be aware that the Socrates code indexer is still in the early stages of development. While it works well with the provided `socrates-demo-repo`, it may still contain bugs and may not function correctly with arbitrary JavaScript (JS) or TypeScript (TS) code.

To use Socrates, follow these steps:

1. Go to View > Command Palette (or press `CMD` + `SHIFT` + `P` on Mac).
1. Search for `Build Socrates` Index and wait until the index is built.
1. Open any JavaScript (JS) file and place your cursor at any arbitrary function.
1. Press `CTRL` + `SHIFT` + `S` to start navigating your code in Socrates, beginning at that arbitrary function.

If you have any questions or feedback, please don't hesitate to reach out to Fron (twitter: [@fronseneca](https://twitter.com/fronseneca)
) or Nithin. We're always here to help you get the most out of Socrates.

Happy navigating!
