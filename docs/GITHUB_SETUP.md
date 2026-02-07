# GitHub Repository Setup

Your code has been committed to git. Follow these steps to push to GitHub:

## Option 1: Create Repo via GitHub Website (Recommended)

1. Go to https://github.com/new
2. Repository name: `footfive-front` (or your preferred name)
3. Description: "FootFive - Live 5-a-side football tournament frontend"
4. Choose Public or Private
5. **DO NOT** initialize with README, .gitignore, or license (we already have these)
6. Click "Create repository"

7. After creating, run these commands:

```bash
cd /home/jd/projects/footfive_front
git remote add origin https://github.com/YOUR_USERNAME/footfive-front.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

## Option 2: Using GitHub CLI (if installed)

If you have GitHub CLI (`gh`) installed, you can run:

```bash
cd /home/jd/projects/footfive_front
gh repo create footfive-front --public --source=. --remote=origin --push
```

## Option 3: SSH (if you have SSH keys set up)

If you prefer SSH over HTTPS:

```bash
cd /home/jd/projects/footfive_front
git remote add origin git@github.com:YOUR_USERNAME/footfive-front.git
git push -u origin main
```

## After Pushing

Your repository will be available at:
`https://github.com/YOUR_USERNAME/footfive-front`

