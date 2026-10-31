import { MotionConfig, motion } from 'motion/react';

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1];

export function AppMotionProvider({ children }) {
    return (
        <MotionConfig reducedMotion="user" transition={{ duration: 0.24, ease: EASE_OUT_EXPO }}>
            {children}
        </MotionConfig>
    );
}

export function PageTransition({ routeKey, className = 'route-content', children }) {
    return (
        <motion.div
            key={routeKey}
            className={className}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: EASE_OUT_EXPO }}
        >
            {children}
        </motion.div>
    );
}

const staggerContainerVariants = {
    hidden: { opacity: 1 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.045,
            delayChildren: 0.01,
        },
    },
};

const staggerItemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.26, ease: EASE_OUT_EXPO },
    },
};

export function StaggerContainer({ as = 'div', className, children, ...rest }) {
    const Component = motion[as] || motion.div;
    return (
        <Component
            className={className}
            variants={staggerContainerVariants}
            initial="hidden"
            animate="visible"
            {...rest}
        >
            {children}
        </Component>
    );
}

export function StaggerItem({ as = 'div', className, children, ...rest }) {
    const Component = motion[as] || motion.div;
    return (
        <Component className={className} variants={staggerItemVariants} {...rest}>
            {children}
        </Component>
    );
}
