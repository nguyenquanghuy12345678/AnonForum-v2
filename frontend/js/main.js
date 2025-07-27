// Main application logic
class AnonForum {
    constructor() {
        this.currentPage = 1;
        this.currentCategory = 'all';
        this.currentSort = 'createdAt';
        this.posts = [];
        this.isLoading = false;
        this.currentPostId = null;
        
        this.init();
    }

    async init() {
        try {
            // Show loading screen
            this.showLoadingScreen();
            
            // Initialize event listeners
            this.initEventListeners();
            
            // Load initial data
            await this.loadStats();
            await this.loadPosts();
            
            // Update online counter
            this.updateOnlineCounter();
            setInterval(() => this.updateOnlineCounter(), 30000);
            
            // Auto-refresh posts periodically
            setInterval(() => this.autoRefresh(), 60000);
            
            // Hide loading screen
            this.hideLoadingScreen();
            
        } catch (error) {
            console.error('Initialization failed:', error);
            this.showNotification('Không thể tải diễn đàn. Vui lòng thử lại.', 'error');
            this.hideLoadingScreen();
        }
    }

    initEventListeners() {
        // Form submission
        const postForm = document.getElementById('postForm');
        if (postForm) {
            postForm.addEventListener('submit', (e) => this.handlePostSubmit(e));
        }

        // Comment form
        const commentForm = document.getElementById('commentForm');
        if (commentForm) {
            commentForm.addEventListener('submit', (e) => this.handleCommentSubmit(e));
        }

        // Character counters
        this.initCharacterCounters();

        // Modal close events
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.closeAllModals();
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllModals();
            }
        });

        // Auto-save form data
        this.initAutoSave();

        // Lazy loading
        this.initInfiniteScroll();
    }

    initCharacterCounters() {
        const inputs = [
            { input: 'postTitle', counter: 'titleCounter', max: 200 },
            { input: 'postContent', counter: 'contentCounter', max: 5000 },
            { input: 'commentContent', counter: 'commentCounter', max: 2000 }
        ];

        inputs.forEach(({ input, counter, max }) => {
            const inputEl = document.getElementById(input);
            const counterEl = document.getElementById(counter);
            
            if (inputEl && counterEl) {
                inputEl.addEventListener('input', () => {
                    const length = inputEl.value.length;
                    counterEl.textContent = length;
                    
                    // Color coding
                    if (length > max * 0.9) {
                        counterEl.style.color = 'var(--error-color)';
                    } else if (length > max * 0.7) {
                        counterEl.style.color = 'var(--warning-color)';
                    } else {
                        counterEl.style.color = 'var(--text-secondary)';
                    }
                });
            }
        });
    }

    initAutoSave() {
        const form = document.getElementById('postForm');
        if (!form) return;

        const inputs = form.querySelectorAll('input, textarea, select');
        inputs.forEach(input => {
            input.addEventListener('input', () => {
                this.saveFormData();
            });
        });

        // Load saved data on page load
        this.loadFormData();
    }

    saveFormData() {
        try {
            const formData = {
                title: document.getElementById('postTitle')?.value || '',
                content: document.getElementById('postContent')?.value || '',
                category: document.getElementById('postCategory')?.value || '',
                tags: document.getElementById('postTags')?.value || ''
            };
            
            sessionStorage.setItem('anonforum_draft', JSON.stringify(formData));
        } catch (error) {
            console.warn('Could not save form data:', error);
        }
    }

    loadFormData() {
        try {
            const saved = sessionStorage.getItem('anonforum_draft');
            if (saved) {
                const formData = JSON.parse(saved);
                
                const elements = {
                    postTitle: formData.title,
                    postContent: formData.content,
                    postCategory: formData.category,
                    postTags: formData.tags
                };

                Object.entries(elements).forEach(([id, value]) => {
                    const element = document.getElementById(id);
                    if (element && value) {
                        element.value = value;
                        // Trigger input event for character counters
                        element.dispatchEvent(new Event('input'));
                    }
                });
            }
        } catch (error) {
            console.warn('Could not load form data:', error);
        }
    }

    clearSavedFormData() {
        try {
            sessionStorage.removeItem('anonforum_draft');
        } catch (error) {
            console.warn('Could not clear saved form data:', error);
        }
    }

    initInfiniteScroll() {
        let debounceTimer;
        
        window.addEventListener('scroll', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 1000) {
                    if (!this.isLoading && this.hasMorePosts()) {
                        this.loadMorePosts();
                    }
                }
            }, 100);
        });
    }

    showLoadingScreen() {
        const loadingScreen = document.getElementById('loadingScreen');
        const mainContainer = document.getElementById('mainContainer');
        
        if (loadingScreen) loadingScreen.style.display = 'flex';
        if (mainContainer) mainContainer.style.display = 'none';
    }

    hideLoadingScreen() {
        const loadingScreen = document.getElementById('loadingScreen');
        const mainContainer = document.getElementById('mainContainer');
        
        setTimeout(() => {
            if (loadingScreen) {
                loadingScreen.style.opacity = '0';
                setTimeout(() => {
                    loadingScreen.style.display = 'none';
                    if (mainContainer) mainContainer.style.display = 'block';
                }, 500);
            }
        }, 1000); // Minimum loading time for UX
    }

    async loadStats() {
        try {
            const stats = await API.getStats();
            
            document.getElementById('totalPosts').textContent = this.formatNumber(stats.totalPosts);
            document.getElementById('totalComments').textContent = this.formatNumber(stats.totalComments);
            document.getElementById('postsToday').textContent = this.formatNumber(stats.postsToday);
        } catch (error) {
            console.error('Failed to load stats:', error);
            // Set default values
            document.getElementById('totalPosts').textContent = '-';
            document.getElementById('totalComments').textContent = '-';
            document.getElementById('postsToday').textContent = '-';
        }
    }

    async loadPosts(page = 1, append = false) {
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.showPostsLoading(!append);

        try {
            const response = await API.getPosts({
                page,
                category: this.currentCategory === 'all' ? undefined : this.currentCategory,
                sort: this.currentSort,
                limit: 20
            });

            if (append) {
                this.posts = [...this.posts, ...response.posts];
            } else {
                this.posts = response.posts;
                this.currentPage = page;
            }

            this.renderPosts();
            this.updatePagination(response.pagination);
            
        } catch (error) {
            console.error('Failed to load posts:', error);
            this.showNotification('Không thể tải bài viết. Vui lòng thử lại.', 'error');
            this.renderEmptyState();
        } finally {
            this.isLoading = false;
            this.hidePostsLoading();
        }
    }

    async loadMorePosts() {
        if (this.hasMorePosts()) {
            await this.loadPosts(this.currentPage + 1, true);
        }
    }

    hasMorePosts() {
        const pagination = document.getElementById('pagination');
        const nextBtn = document.getElementById('nextBtn');
        return nextBtn && !nextBtn.disabled;
    }

    showPostsLoading(replace = true) {
        const container = document.getElementById('postsContainer');
        
        if (replace) {
            container.innerHTML = `
                <div class="loading-posts">
                    <div class="loading-spinner small"></div>
                    <p>Đang tải bài viết...</p>
                </div>
            `;
        } else {
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'loading-posts';
            loadingDiv.innerHTML = `
                <div class="loading-spinner small"></div>
                <p>Đang tải thêm...</p>
            `;
            container.appendChild(loadingDiv);
        }
    }

    hidePostsLoading() {
        const loadingElements = document.querySelectorAll('.loading-posts');
        loadingElements.forEach(el => el.remove());
    }

    renderPosts() {
        const container = document.getElementById('postsContainer');
        
        if (this.posts.length === 0) {
            this.renderEmptyState();
            return;
        }

        container.innerHTML = this.posts.map(post => this.renderPostCard(post)).join('');
    }

    renderPostCard(post) {
        const timeAgo = this.formatTimeAgo(new Date(post.createdAt));
        const tags = post.tags?.map(tag => `<span class="post-tag">#${this.escapeHtml(tag)}</span>`).join('') || '';
        
        return `
            <article class="post-card" data-post-id="${post._id}">
                <header class="post-header">
                    <div class="post-anon-id">👤 ${this.escapeHtml(post.anonId)}</div>
                    <div class="post-meta">
                        <span class="post-timestamp">${timeAgo}</span>
                        <span class="post-expiry">🕒 ${post.timeUntilExpiry || 'Sắp hết hạn'}</span>
                    </div>
                </header>
                
                <h2 class="post-title">${this.escapeHtml(post.title)}</h2>
                
                ${tags ? `<div class="post-tags">${tags}</div>` : ''}
                
                <div class="post-content">${this.formatContent(post.content)}</div>
                
                <footer class="post-actions">
                    <div class="post-stats">
                        <button class="post-action-btn" onclick="forum.likePost('${post._id}')" 
                                data-post-id="${post._id}" data-action="like">
                            <span>👍</span>
                            <span>${post.likes || 0}</span>
                        </button>
                        
                        <button class="post-action-btn" onclick="forum.showComments('${post._id}')"
                                data-post-id="${post._id}" data-action="comment">
                            <span>💬</span>
                            <span>${post.commentCount || 0}</span>
                        </button>
                        
                        <button class="post-action-btn" onclick="forum.sharePost('${post._id}')"
                                data-post-id="${post._id}" data-action="share">
                            <span>🔗</span>
                            <span>Chia sẻ</span>
                        </button>
                    </div>
                    
                    <button class="post-action-btn" onclick="forum.flagPost('${post._id}')" 
                            title="Báo cáo vi phạm">
                        🚩 Báo cáo
                    </button>
                </footer>
            </article>
        `;
    }

    renderEmptyState() {
        const container = document.getElementById('postsContainer');
        const categoryName = this.getCategoryName(this.currentCategory);
        
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🔍</div>
                <h3>Chưa có bài viết nào</h3>
                <p>Chưa có bài viết nào trong ${categoryName}. Hãy là người đầu tiên chia sẻ!</p>
                <button class="btn btn-primary" onclick="forum.showCreatePost()">
                    ✍️ Tạo bài viết đầu tiên
                </button>
            </div>
        `;
    }

    async handlePostSubmit(e) {
        e.preventDefault();
        
        if (this.isLoading) return;
        
        const form = e.target;
        const formData = new FormData(form);
        
        // Validate form
        if (!this.validatePostForm(form)) {
            return;
        }
        
        const postData = {
            title: formData.get('title') || document.getElementById('postTitle').value,
            content: formData.get('content') || document.getElementById('postContent').value,
            category: formData.get('category') || document.getElementById('postCategory').value,
            tags: this.parseTags(formData.get('tags') || document.getElementById('postTags').value)
        };

        this.setSubmitButtonLoading(true);

        try {
            const response = await API.createPost(postData);
            
            this.showNotification('✅ Bài viết đã được đăng thành công!', 'success');
            this.clearForm();
            this.clearSavedFormData();
            this.hideCreatePost();
            
            // Refresh posts to show the new one
            await this.loadPosts(1);
            await this.loadStats();
            
        } catch (error) {
            console.error('Failed to create post:', error);
            this.showNotification(
                error.message || 'Không thể đăng bài viết. Vui lòng thử lại.',
                'error'
            );
        } finally {
            this.setSubmitButtonLoading(false);
        }
    }

    validatePostForm(form) {
        const title = document.getElementById('postTitle').value.trim();
        const content = document.getElementById('postContent').value.trim();
        const category = document.getElementById('postCategory').value;
        
        let isValid = true;
        
        // Clear previous errors
        form.querySelectorAll('.form-group').forEach(group => {
            group.classList.remove('error');
            const errorMsg = group.querySelector('.form-error');
            if (errorMsg) errorMsg.remove();
        });
        
        // Validate title
        if (!title || title.length < 3) {
            this.showFieldError('postTitle', 'Tiêu đề phải có ít nhất 3 ký tự');
            isValid = false;
        } else if (title.length > 200) {
            this.showFieldError('postTitle', 'Tiêu đề không được quá 200 ký tự');
            isValid = false;
        }
        
        // Validate content
        if (!content || content.length < 10) {
            this.showFieldError('postContent', 'Nội dung phải có ít nhất 10 ký tự');
            isValid = false;
        } else if (content.length > 5000) {
            this.showFieldError('postContent', 'Nội dung không được quá 5000 ký tự');
            isValid = false;
        }
        
        // Validate category
        if (!category) {
            this.showFieldError('postCategory', 'Vui lòng chọn chủ đề');
            isValid = false;
        }
        
        return isValid;
    }

    showFieldError(fieldId, message) {
        const field = document.getElementById(fieldId);
        const formGroup = field.closest('.form-group');
        
        formGroup.classList.add('error');
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'form-error';
        errorDiv.textContent = message;
        
        formGroup.appendChild(errorDiv);
        
        // Scroll to first error
        if (!document.querySelector('.form-group.error')) {
            field.scrollIntoView({ behavior: 'smooth', block: 'center' });
            field.focus();
        }
    }

    parseTags(tagsString) {
        if (!tagsString || !tagsString.trim()) return [];
        
        return tagsString
            .split(',')
            .map(tag => tag.trim())
            .filter(tag => tag.length > 0 && tag.length <= 50)
            .slice(0, 5);
    }

    setSubmitButtonLoading(isLoading) {
        const submitBtn = document.getElementById('submitBtn');
        const btnText = submitBtn.querySelector('.btn-text');
        const btnLoading = submitBtn.querySelector('.btn-loading');
        
        if (isLoading) {
            submitBtn.disabled = true;
            submitBtn.classList.add('btn-loading');
            btnText.style.opacity = '0.7';
            btnLoading.style.display = 'inline';
        } else {
            submitBtn.disabled = false;
            submitBtn.classList.remove('btn-loading');
            btnText.style.opacity = '1';
            btnLoading.style.display = 'none';
        }
    }

    // Utility functions
    formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }

    formatTimeAgo(date) {
        const now = new Date();
        const diff = now - date;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'Vừa xong';
        if (minutes < 60) return `${minutes} phút trước`;
        if (hours < 24) return `${hours} giờ trước`;
        if (days < 7) return `${days} ngày trước`;
        
        return date.toLocaleDateString('vi-VN');
    }

    formatContent(content) {
        if (!content) return '';
        
        // Escape HTML and convert line breaks
        const escaped = this.escapeHtml(content);
        
        // Convert URLs to links
        const withLinks = escaped.replace(
            /(https?:\/\/[^\s]+)/g,
            '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
        );
        
        // Convert line breaks to <br>
        return withLinks.replace(/\n/g, '<br>');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    getCategoryName(category) {
        const categories = {
            'all': 'tất cả chủ đề',
            'general': 'tổng hợp',
            'tech': 'công nghệ',
            'crypto': 'cryptocurrency',
            'society': 'xã hội',
            'random': 'random',
            'confession': 'tâm sự',
            'question': 'hỏi đáp'
        };
        return categories[category] || category;
    }

    updateOnlineCounter() {
        const count = 200 + Math.floor(Math.random() * 100);
        const onlineElement = document.getElementById('onlineCount');
        if (onlineElement) {
            onlineElement.textContent = count;
        }
    }

    async autoRefresh() {
        if (!this.isLoading && this.currentPage === 1) {
            try {
                await this.loadPosts(1);
                await this.loadStats();
            } catch (error) {
                console.warn('Auto-refresh failed:', error);
            }
        }
    }

    // UI Control Methods
    showCreatePost() {
        const form = document.getElementById('createPostForm');
        const toggle = document.querySelector('.create-post-toggle');
        
        if (form.style.display === 'none' || !form.style.display) {
            form.style.display = 'block';
            toggle.classList.add('active');
            document.getElementById('postTitle').focus();
        } else {
            this.hideCreatePost();
        }
    }

    hideCreatePost() {
        const form = document.getElementById('createPostForm');
        const toggle = document.querySelector('.create-post-toggle');
        
        form.style.display = 'none';
        toggle.classList.remove('active');
    }

    clearForm() {
        const form = document.getElementById('postForm');
        if (form) {
            form.reset();
            
            // Reset character counters
            document.getElementById('titleCounter').textContent = '0';
            document.getElementById('contentCounter').textContent = '0';
            
            // Clear any error states
            form.querySelectorAll('.form-group').forEach(group => {
                group.classList.remove('error');
                const errorMsg = group.querySelector('.form-error');
                if (errorMsg) errorMsg.remove();
            });
        }
    }

    // Post Actions
    async likePost(postId) {
        try {
            const button = document.querySelector(`[data-post-id="${postId}"][data-action="like"]`);
            if (button.classList.contains('liked')) {
                return; // Already liked
            }

            const response = await API.likePost(postId);
            
            // Update UI
            button.classList.add('liked');
            button.querySelector('span:last-child').textContent = response.likes;
            
            // Visual feedback
            button.style.transform = 'scale(1.2)';
            setTimeout(() => {
                button.style.transform = '';
            }, 200);
            
        } catch (error) {
            console.error('Failed to like post:', error);
            this.showNotification('Không thể like bài viết. Vui lòng thử lại.', 'error');
        }
    }

    async flagPost(postId) {
        if (!confirm('Bạn có chắc muốn báo cáo bài viết này vi phạm quy định?')) {
            return;
        }

        try {
            await API.flagPost(postId);
            this.showNotification('✅ Đã báo cáo bài viết. Cảm ơn bạn!', 'success');
        } catch (error) {
            console.error('Failed to flag post:', error);
            this.showNotification('Không thể báo cáo bài viết. Vui lòng thử lại.', 'error');
        }
    }

    async sharePost(postId) {
        const post = this.posts.find(p => p._id === postId);
        if (!post) return;

        const shareData = {
            title: post.title,
            text: post.content.substring(0, 100) + '...',
            url: `${window.location.origin}#post-${postId}`
        };

        try {
            if (navigator.share && navigator.canShare(shareData)) {
                await navigator.share(shareData);
                this.showNotification('✅ Đã chia sẻ bài viết!', 'success');
            } else {
                // Fallback to clipboard
                await navigator.clipboard.writeText(shareData.url);
                this.showNotification('🔗 Link đã được copy vào clipboard!', 'success');
            }
        } catch (error) {
            console.warn('Share failed:', error);
            // Manual fallback
            const tempInput = document.createElement('input');
            tempInput.value = shareData.url;
            document.body.appendChild(tempInput);
            tempInput.select();
            document.execCommand('copy');
            document.body.removeChild(tempInput);
            
            this.showNotification('🔗 Link đã được copy!', 'success');
        }
    }

    // Comments
    async showComments(postId) {
        this.currentPostId = postId;
        
        try {
            const response = await API.getPostWithComments(postId);
            this.renderCommentsModal(response.post, response.comments);
            this.showModal('commentsModal');
            
        } catch (error) {
            console.error('Failed to load comments:', error);
            this.showNotification('Không thể tải bình luận. Vui lòng thử lại.', 'error');
        }
    }

    renderCommentsModal(post, comments) {
        // Render post preview
        const postPreview = document.getElementById('modalPostPreview');
        postPreview.innerHTML = `
            <div class="post-meta">
                <strong>${this.escapeHtml(post.anonId)}</strong>
                <span>${this.formatTimeAgo(new Date(post.createdAt))}</span>
            </div>
            <h3>${this.escapeHtml(post.title)}</h3>
            <div class="post-content">${this.formatContent(post.content)}</div>
        `;

        // Render comments
        const commentsList = document.getElementById('commentsList');
        if (comments.length === 0) {
            commentsList.innerHTML = `
                <div class="empty-state">
                    <p>Chưa có bình luận nào. Hãy là người đầu tiên!</p>
                </div>
            `;
        } else {
            commentsList.innerHTML = comments.map(comment => `
                <div class="comment-item">
                    <div class="comment-header">
                        <strong class="comment-anon-id">${this.escapeHtml(comment.anonId)}</strong>
                        <span class="comment-timestamp">${this.formatTimeAgo(new Date(comment.createdAt))}</span>
                    </div>
                    <div class="comment-content">${this.formatContent(comment.content)}</div>
                </div>
            `).join('');
        }
    }

    async handleCommentSubmit(e) {
        e.preventDefault();
        
        if (!this.currentPostId) return;
        
        const content = document.getElementById('commentContent').value.trim();
        if (!content) {
            this.showNotification('Vui lòng nhập nội dung bình luận', 'warning');
            return;
        }

        if (content.length > 2000) {
            this.showNotification('Bình luận không được quá 2000 ký tự', 'error');
            return;
        }

        try {
            const response = await API.createComment(this.currentPostId, { content });
            
            // Add new comment to the list
            const commentsList = document.getElementById('commentsList');
            const emptyState = commentsList.querySelector('.empty-state');
            if (emptyState) {
                emptyState.remove();
            }
            
            const newCommentHtml = `
                <div class="comment-item" style="animation: bounceIn 0.5s ease;">
                    <div class="comment-header">
                        <strong class="comment-anon-id">${this.escapeHtml(response.comment.anonId)}</strong>
                        <span class="comment-timestamp">Vừa xong</span>
                    </div>
                    <div class="comment-content">${this.formatContent(response.comment.content)}</div>
                </div>
            `;
            
            commentsList.insertAdjacentHTML('beforeend', newCommentHtml);
            
            // Clear form
            document.getElementById('commentContent').value = '';
            document.getElementById('commentCounter').textContent = '0';
            
            // Update comment count in main post
            const postCard = document.querySelector(`[data-post-id="${this.currentPostId}"]`);
            if (postCard) {
                const commentBtn = postCard.querySelector('[data-action="comment"] span:last-child');
                if (commentBtn) {
                    const currentCount = parseInt(commentBtn.textContent) || 0;
                    commentBtn.textContent = currentCount + 1;
                }
            }
            
            this.showNotification('✅ Bình luận đã được đăng!', 'success');
            
        } catch (error) {
            console.error('Failed to create comment:', error);
            this.showNotification('Không thể đăng bình luận. Vui lòng thử lại.', 'error');
        }
    }

    // Filtering and Sorting
    async filterPosts(category) {
        this.currentCategory = category;
        this.currentPage = 1;
        
        // Update active filter button
        document.querySelectorAll('.filter-tab').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-category="${category}"]`).classList.add('active');
        
        await this.loadPosts(1);
    }

    async sortPosts() {
        const sortSelect = document.getElementById('sortBy');
        this.currentSort = sortSelect.value;
        this.currentPage = 1;
        
        await this.loadPosts(1);
    }

    async refreshPosts() {
        const refreshBtn = document.querySelector('.refresh-btn');
        refreshBtn.style.transform = 'rotate(360deg)';
        
        await this.loadPosts(1);
        await this.loadStats();
        
        setTimeout(() => {
            refreshBtn.style.transform = '';
        }, 500);
    }

    // Pagination
    updatePagination(pagination) {
        const paginationEl = document.getElementById('pagination');
        const pageInfo = document.getElementById('pageInfo');
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');
        
        if (pagination.total <= 1) {
            paginationEl.style.display = 'none';
            return;
        }
        
        paginationEl.style.display = 'flex';
        pageInfo.textContent = `Trang ${pagination.current} / ${pagination.total}`;
        
        prevBtn.disabled = !pagination.hasPrev;
        nextBtn.disabled = !pagination.hasNext;
    }

    async changePage(direction) {
        const newPage = this.currentPage + direction;
        if (newPage < 1) return;
        
        await this.loadPosts(newPage);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Modal Management
    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            
            // Focus management
            const firstFocusable = modal.querySelector('input, textarea, button, [tabindex]:not([tabindex="-1"])');
            if (firstFocusable) {
                firstFocusable.focus();
            }
        }
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    closeAllModals() {
        document.querySelectorAll('.modal.active').forEach(modal => {
            modal.classList.remove('active');
        });
        document.body.style.overflow = '';
    }

    closeCommentsModal() {
        this.closeModal('commentsModal');
        this.currentPostId = null;
    }

    // Notifications
    showNotification(message, type = 'info', duration = 5000) {
        const container = document.getElementById('notificationContainer');
        
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };
        
        notification.innerHTML = `
            <span class="notification-icon">${icons[type] || icons.info}</span>
            <span class="notification-text">${message}</span>
            <button class="notification-close" onclick="this.parentElement.remove()">×</button>
        `;
        
        container.appendChild(notification);
        
        // Auto-remove notification
        setTimeout(() => {
            if (notification.parentElement) {
                notification.style.opacity = '0';
                notification.style.transform = 'translateY(-20px)';
                setTimeout(() => notification.remove(), 300);
            }
        }, duration);
    }

    // Privacy and About
    showAbout() {
        this.showModal('aboutModal');
    }

    showPrivacyPolicy() {
        this.showNotification('Chính sách bảo mật: Chúng tôi không lưu trữ bất kỳ thông tin cá nhân nào.', 'info', 10000);
    }

    showSecurityInfo() {
        this.showNotification('🛡️ Bảo mật: Dữ liệu được mã hóa, không lưu IP, tự xóa sau 7 ngày.', 'info', 10000);
    }

    closePrivacyBanner() {
        const banner = document.getElementById('privacyBanner');
        if (banner) {
            banner.style.opacity = '0';
            banner.style.transform = 'translateY(-20px)';
            setTimeout(() => banner.remove(), 300);
        }
    }
}

// Global functions for HTML onclick handlers
window.forum = null;

window.toggleCreatePost = () => forum?.showCreatePost();
window.clearForm = () => forum?.clearForm();
window.filterPosts = (category) => forum?.filterPosts(category);
window.sortPosts = () => forum?.sortPosts();
window.refreshPosts = () => forum?.refreshPosts();
window.changePage = (direction) => forum?.changePage(direction);
window.closeCommentsModal = () => forum?.closeCommentsModal();
window.closeModal = (modalId) => forum?.closeModal(modalId);
window.showAbout = () => forum?.showAbout();
window.showPrivacyPolicy = () => forum?.showPrivacyPolicy();
window.showSecurityInfo = () => forum?.showSecurityInfo();
window.closePrivacyBanner = () => forum?.closePrivacyBanner();

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.forum = new AnonForum();
});

// Handle visibility change for auto-refresh
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && window.forum) {
        window.forum.updateOnlineCounter();
    }
});

// Export for potential module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AnonForum;
}