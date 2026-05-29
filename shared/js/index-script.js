// Index page interactive features
document.addEventListener('DOMContentLoaded', function() {
    // Smooth scroll for any anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href !== '#' && document.querySelector(href)) {
                e.preventDefault();
                document.querySelector(href).scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Intersection Observer for fade-in animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -100px 0px'
    };

    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    // Observe all theme cards and paper cards
    const observeElements = document.querySelectorAll('.theme-card, .section-header');
    observeElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });

    // Add parallax effect to hero gradient
    const heroGradient = document.querySelector('.hero-gradient');
    if (heroGradient) {
        window.addEventListener('scroll', () => {
            const scrolled = window.pageYOffset;
            const rate = scrolled * 0.5;
            heroGradient.style.transform = `translate3d(0, ${rate}px, 0)`;
        });
    }

    // Add hover effect enhancement for paper cards
    const paperCards = document.querySelectorAll('.paper-card:not(.coming-soon)');
    paperCards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
        });

        card.addEventListener('mousemove', function(e) {
            const rect = this.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const centerX = rect.width / 2;
            const centerY = rect.height / 2;

            const rotateX = (y - centerY) / 30;
            const rotateY = (centerX - x) / 30;

            this.style.transform = `translateY(-8px) perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
        });

        card.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0) perspective(1000px) rotateX(0) rotateY(0)';
        });
    });

    // Add subtle animation to theme icons on hover
    const themeCards = document.querySelectorAll('.theme-card');
    themeCards.forEach(card => {
        const icon = card.querySelector('.theme-icon');

        card.addEventListener('mouseenter', () => {
            icon.style.transform = 'scale(1.2) rotate(5deg)';
            icon.style.transition = 'transform 0.3s ease';
        });

        card.addEventListener('mouseleave', () => {
            icon.style.transform = 'scale(1) rotate(0deg)';
        });
    });

    // Add animated gradient to hero section
    let hue = 0;
    setInterval(() => {
        hue = (hue + 0.5) % 360;
        const heroSection = document.querySelector('.index-hero');
        if (heroSection) {
            heroSection.style.background = `linear-gradient(135deg,
                hsl(${hue}, 70%, 60%) 0%,
                hsl(${(hue + 60) % 360}, 70%, 50%) 100%)`;
        }
    }, 100);

    // Add fade-in animation for highlights on scroll
    const highlights = document.querySelectorAll('.highlight-item');
    const highlightObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                setTimeout(() => {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateX(0)';
                }, index * 100);
            }
        });
    }, { threshold: 0.5 });

    highlights.forEach(highlight => {
        highlight.style.opacity = '0';
        highlight.style.transform = 'translateX(-20px)';
        highlight.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
        highlightObserver.observe(highlight);
    });

    console.log('AI Research Collection - Interactive features loaded');
});
