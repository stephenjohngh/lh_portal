echo ""
echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Edit .env and add your Supabase credentials"
echo "2. Run: npm run dev"
echo "3. Open: http://localhost:5173"
echo ""
echo "🚀 To deploy to Netlify:"
echo "   npm run build"
echo "   netlify deploy --prod"
echo ""


U:\ai_dev>git config --global user.email "sp@sp.co"

U:\ai_dev>git config --global user.name "sp"

       git init
git config --global --add safe.directory U:/ai_dev/lh_portal
       git add .
       git commit -m "initial commit"
       git branch -M main
       git remote add origin https://github.com/stephenjohngh/meeting-app.git
       git push -u origin main
