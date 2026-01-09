// Custom Copy Button logic for code blocks
function addCopyButtons() {
    const codeBlocks = document.querySelectorAll('pre');
    
    codeBlocks.forEach((pre) => {
        // Wrapper for positioning
        const wrapper = document.createElement('div');
        wrapper.className = 'relative group';
        
        pre.parentNode?.insertBefore(wrapper, pre);
        wrapper.appendChild(pre);
        
        // Copy Button
        const button = document.createElement('button');
        button.className = 'absolute top-3 right-3 p-2 rounded-lg bg-slate-700/50 hover:bg-slate-600 text-slate-300 opacity-0 group-hover:opacity-100 transition-all duration-200 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-brand-500';
        button.innerHTML = `
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path></svg>
        `;
        button.setAttribute('aria-label', 'Copy code');
        
        // Copy functionality
        button.addEventListener('click', async () => {
            const code = pre.querySelector('code');
            const text = code?.innerText || '';
            
            try {
                await navigator.clipboard.writeText(text);
                
                // Success feedback
                const originalContent = button.innerHTML;
                button.innerHTML = `<svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`;
                setTimeout(() => {
                    button.innerHTML = originalContent;
                }, 2000);
            } catch (err) {
                console.error('Failed to copy!', err);
            }
        });
        
        wrapper.appendChild(button);
    });
}

// Init on load and after swap
document.addEventListener('astro:page-load', addCopyButtons);
