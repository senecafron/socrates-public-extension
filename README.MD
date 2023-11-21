<img src="https://i.ibb.co/PCLg1Lr/Group-39.png" alt="Socrates Logo" width="230" height="69">



# Welcome to the Socrates Extension!

<img src="https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExenI3NWVwamZ2cjU3c2RvdWkwN3BuemhvYWxuMjh4NHVkNGhxcHp0eSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/r0ZlVdMr21vJI5h3pQ/source.gif" alt="Socrates Gif">

We're thrilled to have you on board with the (soon to be)  world's best code navigator, Socrates. With Socrates, you'll be able to navigate your codebase with ease, visualizing how functions and variables are connected with one another on an infinite canvas, just like a map!

No need to navigate dozens of files when you can see how every part of your code is interconnected, all on a single infinite canvas

To install the Socrates extension, follow these steps:
1. Make sure you have up to date Visual Studio Code
1. Clone this repository
1. Open Visual Studio Code
1. Navigate to the `Extensions view` by clicking on the icon that looks like four blocks, with one block detached from the rest
1. Click on the three-dot icon located at the top right of the `Extension View`
1. Choose "Install from VSIX..."
1. Locate the `socrates-0.0.1.vsix` file in the repository that you just cloned or downloaded

Another step that you need to do is to install `typescript-language-server` by running:

```
npm install -g typescript-language-server typescript
```

You might have to prepend the command above with `sudo` if you encounter a permission issue

## Running Socrates on the demo project (`socrates-demo-repo` folder)

Once you have Socrates installed in your VS Code, please be aware that the Socrates code indexer is still in the early stages of development. While it works well with the provided `socrates-demo-repo`, it may still contain bugs and may not function correctly with arbitrary JavaScript (JS) or TypeScript (TS) code

To use Socrates, follow these steps:

1. Go to View > Command Palette (or press `CMD` + `SHIFT` + `P` on Mac)
1. Search for `Build Socrates Index` and wait until the index is built
1. Open any JavaScript (JS) file and place your cursor at any arbitrary function
1. Press `CTRL` + `SHIFT` + `S` to start navigating your code in Socrates, beginning at that arbitrary function

If you have any questions or feedback, please don't hesitate to reach out to Fron (twitter: [@fronseneca](https://twitter.com/fronseneca)
) or Nithin. We're always here to help you get the most out of Socrates.

Happy navigating!
